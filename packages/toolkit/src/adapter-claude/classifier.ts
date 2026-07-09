import { GIT_HISTORY_MUTATION } from '../core/index.js'

/**
 * The `(toolName, toolInput) → actionKind` table (design doc's "adapter-owned
 * classifier" seam; audit 1.2's fail-closed-on-ambiguity requirement).
 *
 * Action kinds returned here are plain strings, membership-checked by
 * `core`'s `isActionAllowed` against a stage's `allows` list — core never
 * enumerates them (audit 3.1). This module is the one place that *is*
 * domain-aware (Bash command strings, the Figma plugin API shape), by
 * design: it's adapter-owned, provider-specific knowledge.
 */

/** Generic kinds this classifier can produce for non-Bash, non-Figma tools. */
export const FILE_READ = 'file-read'
export const FILE_EDIT = 'file-edit'
export const GIT_COMMIT = 'git-commit'
export const TEST_RUN = 'test-run'
export const WEB_FETCH = 'web-fetch'
export const FIGMA_READ = 'figma-read'
export const FIGMA_WRITE = 'figma-write'
export const REGISTRY_READ = 'registry-read'
export const REGISTRY_WRITE = 'registry-write'
export const PLAYBOOK_START = 'playbook-start'

/**
 * Sentinel for "this tool call did not match any enumerated kind." The hook
 * (`hook.ts`, Slice 7) must treat this value as pass-through-to-stage-default
 * rather than a deny — it is NOT itself a general "allowed" bypass of the
 * stage's `allows` list. It is safe to leave unclassified calls unenumerated
 * ONLY because every kind this module considers dangerous
 * (`git-history-mutation`) is matched *before* falling through to this
 * sentinel (audit 1.2's "the enforcer only narrows what it understands, and
 * that is safe only because destructive kinds are explicitly enumerated and
 * denied" invariant). A brand-new destructive-sounding Bash subcommand that
 * is NOT in the enumerated list below (e.g. some future `git purge-history`)
 * would currently fall through to this sentinel too — that is expected and
 * documented here, not a bug: this classifier's safety argument rests on the
 * enumerated list being deny-tagged, not on catching everything.
 */
export const UNCLASSIFIED = 'unclassified'

export type ActionKind =
  | typeof FILE_READ
  | typeof FILE_EDIT
  | typeof GIT_COMMIT
  | typeof TEST_RUN
  | typeof WEB_FETCH
  | typeof FIGMA_READ
  | typeof FIGMA_WRITE
  | typeof REGISTRY_READ
  | typeof REGISTRY_WRITE
  | typeof PLAYBOOK_START
  | typeof GIT_HISTORY_MUTATION
  | typeof UNCLASSIFIED

const FILE_EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const FILE_READ_TOOLS = new Set(['Read', 'Glob', 'Grep'])

// Subcommands split on shell chaining operators — any one of them matching a
// destructive pattern fails the WHOLE command closed to git-history-mutation,
// per audit 1.2 ("git status && git commit --amend" must not slip through on
// the strength of the benign half).
const CHAIN_SPLIT = /&&|\|\||;|\|/

// Patterns are matched against each individual subcommand after splitting.
// Order doesn't matter — history-mutation is checked as a whole set first.
const GIT_HISTORY_MUTATION_PATTERNS: RegExp[] = [
  /\bgit\s+reset\b/,
  /\bgit\s+commit\b[^\n]*--amend\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+checkout\s+--\s+/, // explicit `git checkout -- <path>` tracked-path revert form
  /\bgit\s+filter-branch\b/
]

const GIT_COMMIT_PATTERN = /\bgit\s+commit\b/

// Deliberately coarse — a heuristic covering the common runners, not an
// exhaustive registry. False negatives here just fall through to
// UNCLASSIFIED, which is safe per this module's documented invariant above.
const TEST_RUN_PATTERNS: RegExp[] = [
  /\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b/,
  /\bvitest\b/,
  /\bjest\b/,
  /\bpytest\b/,
  /\bgo\s+test\b/,
  /\brspec\b/
]

function splitChain(command: string): string[] {
  return command
    .split(CHAIN_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Classifies a Bash tool call's command string. Ambiguity (a compound/chained
 * command containing both a benign and a destructive subcommand) fails closed
 * to `GIT_HISTORY_MUTATION` (audit 1.2). */
export function classifyBashCommand(command: string): ActionKind {
  const subcommands = splitChain(command)

  if (subcommands.some((sub) => GIT_HISTORY_MUTATION_PATTERNS.some((p) => p.test(sub)))) {
    return GIT_HISTORY_MUTATION
  }
  if (subcommands.some((sub) => GIT_COMMIT_PATTERN.test(sub))) {
    return GIT_COMMIT
  }
  if (subcommands.some((sub) => TEST_RUN_PATTERNS.some((p) => p.test(sub)))) {
    return TEST_RUN
  }
  // Spec-vocabulary kinds the stage allows lists gate on (playbook specs use
  // `playbook-start` / `registry-write` — without these mappings a stage
  // would deny its own core action).
  if (subcommands.some((sub) => /\bargo\s+playbook\s+start\b/.test(sub))) {
    return PLAYBOOK_START
  }
  if (subcommands.some((sub) => /\bargo\s+design\s+pull-registry\b/.test(sub))) {
    return REGISTRY_WRITE
  }
  return UNCLASSIFIED
}

// Script-sniff heuristic for `use_figma` tool calls: the tool's input carries
// a JS snippet executed against the Figma plugin API. We look for
// write-shaped call/assignment patterns (node creation, mutation, deletion,
// property assignment) vs read-only patterns (lookups, traversal, export).
// Presence of ANY write-shaped pattern wins — a script that both reads and
// writes is a write for permission purposes (same fail-closed-to-stricter-kind
// spirit as the git classifier, applied to the one other domain this adapter
// is aware of).
const FIGMA_WRITE_PATTERNS: RegExp[] = [
  /\.appendChild\s*\(/,
  /\.createFrame\s*\(/,
  /\.createRectangle\s*\(/,
  /\.createText\s*\(/,
  /\.createComponent\s*\(/,
  /\.createPage\s*\(/,
  /\.remove\s*\(/,
  /\.removeAll\s*\(/,
  /\.clone\s*\(/,
  /\.resize\s*\(/,
  /\.appendChild\b/,
  /\bsetPluginData\s*\(/,
  /\bsetRelaunchData\s*\(/,
  // property assignment on a node/style handle, e.g. `node.fills = [...]`,
  // `frame.name = "x"`, `text.characters = "..."` — deliberately broad since
  // any `.<identifier> =` on a figma-ish handle is a mutation.
  /\b\w+\.(fills|strokes|name|characters|visible|locked|x|y|width|height|opacity|cornerRadius|layoutMode)\s*=/
]

const FIGMA_READ_PATTERNS: RegExp[] = [
  /\.getNodeById\s*\(/,
  /\.getNodeByIdAsync\s*\(/,
  /\.findAll\s*\(/,
  /\.findOne\s*\(/,
  /\.findChild\s*\(/,
  /\.findChildren\s*\(/,
  /\.getStyleById\s*\(/,
  /\bexportAsync\s*\(/,
  /\.selection\b/
]

/** Script-sniffs a `use_figma` tool call's script input for write-shaped vs
 * read-only Figma plugin API usage. */
export function classifyFigmaScript(script: string): ActionKind {
  if (FIGMA_WRITE_PATTERNS.some((p) => p.test(script))) {
    return FIGMA_WRITE
  }
  if (FIGMA_READ_PATTERNS.some((p) => p.test(script))) {
    return FIGMA_READ
  }
  return UNCLASSIFIED
}

function extractFigmaScript(toolInput: unknown): string | undefined {
  if (toolInput && typeof toolInput === 'object') {
    const candidate =
      (toolInput as Record<string, unknown>).script ??
      (toolInput as Record<string, unknown>).code ??
      (toolInput as Record<string, unknown>).command
    if (typeof candidate === 'string') return candidate
  }
  return undefined
}

/** The one `(toolName, toolInput) → actionKind` table this adapter uses to
 * feed the permission hook (`hook.ts`, Slice 7) and the classifier tests
 * below. Unrecognized tool names / malformed inputs fall through to
 * `UNCLASSIFIED` (see its doc comment for why that is safe). */
export function classifyAction(toolName: string, toolInput: unknown): ActionKind {
  if (toolName === 'Bash') {
    const command = toolInput && typeof toolInput === 'object' ? (toolInput as Record<string, unknown>).command : undefined
    if (typeof command === 'string') return classifyBashCommand(command)
    return UNCLASSIFIED
  }
  if (toolName === 'mcp__plugin_figma_figma__use_figma') {
    const script = extractFigmaScript(toolInput)
    if (script !== undefined) return classifyFigmaScript(script)
    return UNCLASSIFIED
  }
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    return WEB_FETCH
  }
  if (FILE_EDIT_TOOLS.has(toolName)) {
    return isRegistryPath(toolInput) ? REGISTRY_WRITE : FILE_EDIT
  }
  if (FILE_READ_TOOLS.has(toolName)) {
    return isRegistryPath(toolInput) ? REGISTRY_READ : FILE_READ
  }
  return UNCLASSIFIED
}

/** The machine-written registry is its own action kind: playbook stages grant
 * `registry-write` narrowly (registry-card, registry-sync) without opening
 * general `file-edit`. */
function isRegistryPath(toolInput: unknown): boolean {
  if (!toolInput || typeof toolInput !== 'object') return false
  const p = (toolInput as Record<string, unknown>).file_path ?? (toolInput as Record<string, unknown>).path
  return typeof p === 'string' && /(^|\/)design\/registry\.json$/.test(p)
}
