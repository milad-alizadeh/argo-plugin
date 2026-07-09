import {
  getPlaybook,
  isActionAllowed,
  isProtectedPath,
  type ArgoConfig,
  type PlaybookInstance
} from '../core/index.js'
import { classifyAction, FIGMA_WRITE, FILE_EDIT, UNCLASSIFIED } from './classifier.js'

/**
 * The generic PreToolUse permission hook BODY (Slice 7, step 21) — a pure
 * function over a parsed hook-input object, live config, and an injectable
 * "read the active instance" function. This module deliberately does NOT
 * touch stdin/stdout or process.exit — wiring this body into kit's real
 * hook dispatch (reading stdin JSON, writing the exit code / stderr) is
 * Slice 8's job, mirroring `trust-gate.ts`/`red-proof-gate.ts`'s envelope
 * shape (`{ tool_name, tool_input, cwd }` off parsed stdin JSON) but as a
 * pure, directly-testable function rather than a script with side effects.
 *
 * Session-instance caching: `runPermissionHook` takes a `readActiveInstance`
 * callback rather than calling `core`'s `readInstance` itself. Slice 8's
 * wiring may memoize that callback per session (the design doc's "session-
 * cached" note) or simply pass a thunk that reads fresh off disk every call
 * — both are valid `ActiveInstanceReader` implementations from this
 * module's point of view; this slice does not itself cache, so the choice is
 * documented here rather than hidden inside this file.
 */

/** The subset of a Claude Code PreToolUse hook event this module needs,
 * mirroring `trust-gate.ts`'s stdin-JSON envelope shape (`tool_input`, `cwd`)
 * plus `tool_name` (needed by `classifyAction`, which trust-gate/red-proof-
 * gate don't need since each is hardwired to Bash). */
export interface HookInput {
  tool_name: string
  tool_input: unknown
  cwd?: string
}

/** Callback the hook body uses to obtain the currently-active playbook
 * instance for this session/target, or `null` if none is active. Injected
 * rather than called directly against `core`'s state store so Slice 8 can
 * decide the caching/session-scoping strategy without this module changing
 * shape. */
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

/** Kinds treated as "edit-shaped" for `noPlaybook: "coach"`/`"deny-edits"` purposes —
 * anything that writes/mutates a working artifact. `git-commit` and
 * `git-history-mutation` are deliberately excluded here: with no active
 * playbook there is no stage to violate, and blocking commits/history ops
 * outside a playbook is a stricter policy this hook doesn't own (that's the
 * unconditional protected-path/classifier-level denial below, which already
 * covers the dangerous cases regardless of `noPlaybook`). */
const EDIT_SHAPED_KINDS = new Set<string>([FILE_EDIT, FIGMA_WRITE])

/** Best-effort extraction of a file path from a tool call's input, for the
 * protected-path check and for naming "the correct path" in a coaching
 * message. Returns `undefined` when no path-shaped field is present (e.g.
 * Bash calls, which are checked by `isProtectedPath` too when they happen to
 * carry a recognizable path-bearing field, but usually won't). */
function extractPath(toolInput: unknown): string | undefined {
  if (toolInput && typeof toolInput === 'object') {
    const record = toolInput as Record<string, unknown>
    const candidate = record.file_path ?? record.path ?? record.notebook_path
    if (typeof candidate === 'string') return candidate
  }
  return undefined
}

/**
 * The PreToolUse hook body. Order (per the design doc + audit 1.1's fix):
 *
 * 1. Protected-path check — UNCONDITIONAL, before anything else, regardless
 *    of whether a playbook instance is active or what a stage's `allows`
 *    says. This is audit 1.1: a stage whose `allows` includes `file-edit`
 *    must never be able to write a protected path.
 * 2. Read the active instance. No active instance ⇒ `config.noPlaybook`
 *    decides: `"allow"` passes everything through; `"coach"` allows
 *    edit-shaped action kinds but attaches an advisory suggesting a playbook
 *    start; `"deny-edits"` blocks them with the same coaching.
 * 3. An active instance ⇒ resolve its stage's `allows` (fail closed if the
 *    playbook/stage can't be resolved — an instance pointing at an unknown
 *    playbook or stage name is treated as a denial, never a silent allow).
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
  if (path !== undefined && isProtectedPath(path)) {
    return deny(
      `"${path}" is a protected path (state store / config / registry / manifests) — no stage or config setting may write it`
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

  const spec = getPlaybook(instance.playbook)
  if (!spec) {
    return deny(`active playbook "${instance.playbook}" has no registered spec — denying (fail closed)`)
  }
  const stage = spec.stages.find((s) => s.name === instance.stage)
  if (!stage) {
    return deny(
      `active playbook "${instance.playbook}" is at unknown stage "${instance.stage}" — denying (fail closed)`
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
