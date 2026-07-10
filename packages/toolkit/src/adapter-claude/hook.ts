import {
  getPlaybook,
  isActionAllowed,
  isProtectedPath,
  type ArgoConfig,
  type PlaybookInstance
} from '../core/index.js'
import { classifyAction, extractBashWriteTargets, FIGMA_WRITE, FILE_EDIT, REGISTRY_WRITE, UNCLASSIFIED } from './classifier.js'

// Protected paths are WRITE-protected: reads must pass so sessions can
// consult config/registry/state; the CLI verbs stay the only writers.
const WRITE_SHAPED_KINDS = new Set<string>([FILE_EDIT, REGISTRY_WRITE])

// The generic PreToolUse permission hook body: a pure function over a parsed
// hook-input object, live config, and an injectable "read the active
// instance" function. Deliberately does not touch stdin/stdout/process.exit,
// so it stays directly testable rather than a script with side effects.

/** The subset of a Claude Code PreToolUse hook event this module needs. */
export interface HookInput {
  tool_name: string
  tool_input: unknown
  cwd?: string
}

/** Callback the hook body uses to obtain the currently-active playbook
 * instance for this session/target, or `null` if none is active. Injected so
 * the caller can decide the caching/session-scoping strategy without this
 * module changing shape. */
export type ActiveInstanceReader = () => PlaybookInstance | null

export type HookDecision =
  | { decision: 'allow'; advisory?: string }
  | { decision: 'deny'; reason: string }

function allow(advisory?: string): HookDecision {
  return advisory === undefined ? { decision: 'allow' } : { decision: 'allow', advisory }
}

function deny(reason: string): HookDecision {
  return { decision: 'deny', reason }
}

/** Kinds treated as "edit-shaped" for `noPlaybook: "coach"`/`"deny-edits"`.
 * `git-commit`/`git-history-mutation` are deliberately excluded: with no
 * active playbook there's no stage to violate, and the dangerous cases are
 * already covered unconditionally below regardless of `noPlaybook`. */
const EDIT_SHAPED_KINDS = new Set<string>([FILE_EDIT, FIGMA_WRITE])

/** Best-effort extraction of a file path from a tool call's input, for the
 * protected-path check and for naming "the correct path" in a coaching
 * message. Returns `undefined` when no path-shaped field is present. */
function extractPath(toolInput: unknown): string | undefined {
  if (toolInput && typeof toolInput === 'object') {
    const record = toolInput as Record<string, unknown>
    const candidate = record.file_path ?? record.path ?? record.notebook_path
    if (typeof candidate === 'string') return candidate
  }
  return undefined
}

/** Bash's write-shaped targets that fall under a protected path. Checked
 * separately from `extractPath` because a Bash tool call carries a command
 * string, not a `file_path`/`path` field, so without this a Bash write to a
 * protected path would never surface a path for the floor to catch. */
function extractProtectedBashTarget(toolName: string, toolInput: unknown): string | undefined {
  if (toolName !== 'Bash' || !toolInput || typeof toolInput !== 'object') return undefined
  const command = (toolInput as Record<string, unknown>).command
  if (typeof command !== 'string') return undefined
  return extractBashWriteTargets(command).find((target) => isProtectedPath(target))
}

/**
 * The PreToolUse hook body, in order:
 *
 * 1. Protected-path check — UNCONDITIONAL, before anything else: a stage
 *    whose `allows` includes `file-edit` must never write a protected path.
 * 2. Read the active instance. No active instance -> `config.noPlaybook`
 *    decides: `"allow"` passes everything through; `"coach"` allows
 *    edit-shaped action kinds but attaches an advisory suggesting a playbook
 *    start; `"deny-edits"` blocks them with the same coaching.
 * 3. An active instance -> resolve its stage's `allows`, failing closed if
 *    the playbook/stage can't be resolved (never a silent allow).
 * 4. Classify the tool call, membership-check it against `allows`, deny
 *    with a message naming the stage, the violated rule, and (when
 *    derivable) the correct path.
 */
export function runPermissionHook(
  input: HookInput,
  config: ArgoConfig,
  readActiveInstance: ActiveInstanceReader
): HookDecision {
  const path = extractPath(input.tool_input)
  if (
    path !== undefined &&
    isProtectedPath(path) &&
    WRITE_SHAPED_KINDS.has(classifyAction(input.tool_name, input.tool_input))
  ) {
    return deny(
      `"${path}" is a protected path (state store / config / registry / manifests) — no stage or config setting may write it`
    )
  }

  const bashTarget = extractProtectedBashTarget(input.tool_name, input.tool_input)
  if (bashTarget !== undefined) {
    return deny(
      `"${bashTarget}" is a protected path (state store / config / registry / manifests) — no stage or config setting may write it`
    )
  }

  const instance = readActiveInstance()

  if (!instance) {
    if (config.noPlaybook === 'allow') return allow()
    // 'coach' and 'deny-edits' share the same detection (edit-shaped action
    // kinds only) and the same start-a-playbook coaching — only the verdict
    // differs: coach allows with advisory context, deny-edits denies.
    const kind = classifyAction(input.tool_name, input.tool_input)
    if (EDIT_SHAPED_KINDS.has(kind)) {
      if (config.noPlaybook === 'coach') {
        return allow(
          `no playbook run is attached to this edit — this looks like playbook-shaped work; ` +
            `consider \`argo playbook start <slug> --target <target>\` so the run is staged and gated ` +
            `("noPlaybook": "coach" — the edit itself is allowed).`
        )
      }
      // config.noPlaybook === 'deny-edits'
      return deny(
        `no active playbook — this project requires one before file edits are allowed ` +
          `("noPlaybook": "deny-edits"). Start a playbook first (\`argo playbook start <name> --target <target>\`).`
      )
    }
    return allow()
  }

  // An unresolvable spec/stage is a tooling defect, not a policy violation.
  // Denying here once froze an entire session, including the tools needed to
  // repair the gate (live deadlock, 2026-07-10): the run stays unusable
  // until repaired, but the session's tools must not.
  const spec = getPlaybook(instance.playbook)
  if (!spec) {
    return allow(
      `Playbook gate advisory: active run "${instance.playbook}" has no registered spec — the gate is NOT enforcing. ` +
        `Repair or abandon the run (state: argo playbook status / delete the active-instance pointer).`
    )
  }
  const stage = spec.stages.find((s) => s.name === instance.stage)
  if (!stage) {
    return allow(
      `Playbook gate advisory: active run "${instance.playbook}" is at unknown stage "${instance.stage}" — the gate is NOT enforcing. ` +
        `Repair or abandon the run.`
    )
  }

  const kind = classifyAction(input.tool_name, input.tool_input)
  if (isActionAllowed(kind, stage.allows)) return allow()
  // UNCLASSIFIED is the classifier's documented pass-through sentinel: the
  // enforcer only narrows what it understands (destructive kinds are
  // enumerated and deny-tagged upstream) — denying it would freeze every tool
  // the classifier doesn't know, not just the gated ones.
  if (kind === UNCLASSIFIED) return allow()

  const pathSuffix = path !== undefined ? ` (path: "${path}")` : ''
  return deny(
    `stage "${instance.stage}" of playbook "${instance.playbook}" does not allow "${kind}"${pathSuffix} — ` +
      `allowed action kinds here: ${stage.allows.join(', ')}`
  )
}
