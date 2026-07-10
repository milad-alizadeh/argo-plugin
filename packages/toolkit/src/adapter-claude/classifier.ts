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

// Write/mutation-shaped Bash constructs whose LAST capture group is the
// target path — redirection, tee, copy/move destinations, in-place sed, dd's
// `of=`, and deletion. Deliberately coarse (same heuristic spirit as the git
// patterns above): a false negative here just falls through to UNCLASSIFIED,
// which is the classifier's documented safe default; a false positive merely
// over-classifies a benign command as file-edit, which is a false alarm, not
// a security hole. This is what closes the "Bash bypasses the protected-path
// floor" gap (release-gating #1/#3): a bash write is now both (a) checked
// against `isProtectedPath` and (b) subject to a stage's `allows` list like
// any other file-edit, instead of sailing through as UNCLASSIFIED.
const BASH_WRITE_TARGET_PATTERNS: RegExp[] = [
  />>?\s*([^\s;&|<>]+)/,
  /\btee\s+(?:-a\s+)?([^\s;&|]+)/,
  /\bcp\s+(?:-\w+\s+)*\S+\s+([^\s;&|]+)\s*$/,
  /\bmv\s+(?:-\w+\s+)*\S+\s+([^\s;&|]+)\s*$/,
  /\bsed\s+-i[^\s]*\s+(?:\S+\s+)*?([^\s;&|]+)\s*$/,
  /\bdd\s+.*\bof=([^\s;&|]+)/,
  /\brm\s+(?:-\w+\s+)*([^\s;&|]+)\s*$/
]

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

/** Extracts the write-target path(s) a Bash command's redirection/mutation
 * constructs point at, one per matched subcommand-pattern pair. Returns an
 * empty array for commands with no recognizable write shape. */
export function extractBashWriteTargets(command: string): string[] {
  const targets: string[] = []
  for (const sub of splitChain(command)) {
    for (const pattern of BASH_WRITE_TARGET_PATTERNS) {
      const match = pattern.exec(sub)
      if (match && match[1]) targets.push(stripQuotes(match[1]))
    }
  }
  return targets
}

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
  if (subcommands.some((sub) => /\bargo\s+design\s+(pull-registry|refresh-card|register-screen)\b/.test(sub))) {
    return REGISTRY_WRITE
  }
  // A bash write/mutation must be gated exactly like a FILE_EDIT — both
  // against the unconditional protected-path floor (checked by the hook
  // directly off `extractBashWriteTargets`) and against a stage's `allows`
  // list, rather than falling through to the UNCLASSIFIED pass-through.
  if (extractBashWriteTargets(command).length > 0) {
    return FILE_EDIT
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

// Obfuscation/evasion shapes (Wave A #5): the sniff above only recognizes
// direct `.method(` / `.prop =` call and assignment shapes. A script that
// hides its intent behind `eval`/`atob`/`Function`/char-code decoding, an
// indirect/aliased call, or a computed (bracket-notation) property/method
// reference is UN-SNIFFABLE by those patterns — and for a stage that
// forbids figma-write, an un-sniffable script must fail closed to WRITE,
// not fall through to READ or UNCLASSIFIED (both of which a
// figma-write-forbidding stage would otherwise let pass).
const FIGMA_OBFUSCATION_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /\batob\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"`]/,
  /\bunescape\s*\(/,
  /\bfromCharCode\s*\(/
]

// Computed-property mutation (`node["name"] = ...`) and bracket-notation
// indirect calls to a known write method (`node["remove"]()`,
// `figma["createFrame"]()`) — same write-shaped intent as the dot-notation
// patterns above, just accessed through a string key instead of an
// identifier, which the dot-notation regexes don't match.
const FIGMA_WRITE_METHOD_NAMES =
  'appendChild|createFrame|createRectangle|createText|createComponent|createPage|remove|removeAll|clone|resize|setPluginData|setRelaunchData'
const FIGMA_COMPUTED_WRITE_PATTERNS: RegExp[] = [
  /\[\s*['"`](fills|strokes|name|characters|visible|locked|x|y|width|height|opacity|cornerRadius|layoutMode)['"`]\s*\]\s*=/,
  new RegExp(`\\[\\s*['"\`](${FIGMA_WRITE_METHOD_NAMES})['"\`]\\s*\\]\\s*\\(`)
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
  if (FIGMA_COMPUTED_WRITE_PATTERNS.some((p) => p.test(script))) {
    return FIGMA_WRITE
  }
  if (FIGMA_OBFUSCATION_PATTERNS.some((p) => p.test(script))) {
    return FIGMA_WRITE
  }
  if (FIGMA_READ_PATTERNS.some((p) => p.test(script))) {
    return FIGMA_READ
  }
  return UNCLASSIFIED
}

// All non-`use_figma` tools in the Figma MCP server's family (`get_metadata`,
// `get_design_context`, `get_screenshot`, generators, etc.) — `use_figma` is
// script-sniffed above, everything else here is classified by tool name.
const FIGMA_MCP_TOOL_PATTERN = /^mcp__plugin_figma_figma__(?!use_figma$)/

// Write-shaped Figma MCP tools by name: file/asset/mapping creation, plus the
// two generator tools (`generate_figma_design` creates Figma content,
// `generate_diagram` writes a FigJam file) — no existing precedent for either
// in this classifier, so both are treated as writes on the same reasoning as
// the other creation-shaped tools in this list.
const FIGMA_MCP_WRITE_TOOLS = new Set([
  'mcp__plugin_figma_figma__create_new_file',
  'mcp__plugin_figma_figma__upload_assets',
  'mcp__plugin_figma_figma__send_code_connect_mappings',
  'mcp__plugin_figma_figma__add_code_connect_map',
  'mcp__plugin_figma_figma__export_video',
  'mcp__plugin_figma_figma__generate_figma_design',
  'mcp__plugin_figma_figma__generate_diagram'
])

// Non-figma MCP tool families (`mcp__<plugin>__<tool>`) have no adapter-owned
// classification of their own, so a write-shaped one (a tool whose NAME
// names a mutation) must not silently fall through to UNCLASSIFIED — that
// sentinel is a pass-through in the hook (Wave A #4). Matched against the
// tool name only (no argument shape to sniff, unlike Bash/`use_figma`):
// deliberately broad verb coverage, same fail-closed-for-write-shaped spirit
// as the Bash/Figma classifiers above. A benign-named tool (get/list/search/
// query/read/…) still falls through to UNCLASSIFIED, preserving the
// documented pass-through invariant for genuinely read-only tools.
const MCP_TOOL_PATTERN = /^mcp__/
const MCP_WRITE_VERB_PATTERN =
  /__(write|create|delete|remove|update|set|upload|send|edit|put|append|insert|patch|mutate|modify|apply|execute|run|generate|save|replace)\w*$/

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
  if (FIGMA_MCP_TOOL_PATTERN.test(toolName)) {
    return FIGMA_MCP_WRITE_TOOLS.has(toolName) ? FIGMA_WRITE : FIGMA_READ
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
  if (MCP_TOOL_PATTERN.test(toolName) && MCP_WRITE_VERB_PATTERN.test(toolName)) {
    return FILE_EDIT
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
