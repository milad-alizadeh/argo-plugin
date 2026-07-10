import { GIT_HISTORY_MUTATION } from '../core/index.js'

/** Maps (toolName, toolInput) to a plain-string action kind, membership-checked
 * against a stage's `allows` list. This module is deliberately the one place
 * that is domain-aware (Bash command strings, the Figma plugin API shape). */

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

/** Sentinel for "did not match any enumerated kind" — treated as
 * pass-through-to-stage-default, never a general allow bypass. Safe only
 * because every dangerous kind (`git-history-mutation`) is matched before
 * falling through here; an unenumerated destructive command falls through
 * too, by design, since the safety argument rests on the enumerated list
 * being deny-tagged, not on catching everything. */
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

// Any one chained subcommand matching a destructive pattern fails the WHOLE
// command closed, so a benign half can't smuggle a destructive one through.
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
// target path. Deliberately coarse: a false negative falls through to the
// safe UNCLASSIFIED default, a false positive is just an over-classified
// false alarm, not a security hole.
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

// Heuristic covering common runners, not an exhaustive registry; a false
// negative safely falls through to UNCLASSIFIED.
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
  // Without these mappings a playbook stage would deny its own core action.
  if (subcommands.some((sub) => /\bargo\s+playbook\s+start\b/.test(sub))) {
    return PLAYBOOK_START
  }
  if (subcommands.some((sub) => /\bargo\s+design\s+(pull-registry|refresh-card|register-screen)\b/.test(sub))) {
    return REGISTRY_WRITE
  }
  // A bash write must be gated exactly like FILE_EDIT, not pass through as UNCLASSIFIED.
  if (extractBashWriteTargets(command).length > 0) {
    return FILE_EDIT
  }
  return UNCLASSIFIED
}

// A `use_figma` script that both reads and writes is a write for permission
// purposes: presence of ANY write-shaped pattern wins.
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
  // Deliberately broad: any `.<identifier> =` on a figma-ish handle is a mutation.
  /\b\w+\.(fills|strokes|name|characters|visible|locked|x|y|width|height|opacity|cornerRadius|layoutMode)\s*=/
]

// A script that hides intent behind eval/atob/Function/char-code decoding or
// a computed property reference is un-sniffable by the patterns above; it
// must fail closed to WRITE rather than fall through to READ/UNCLASSIFIED.
const FIGMA_OBFUSCATION_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /\batob\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"`]/,
  /\bunescape\s*\(/,
  /\bfromCharCode\s*\(/
]

// Same write-shaped intent as the dot-notation patterns above, accessed
// through a string key (bracket notation) instead of an identifier.
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

// use_figma is script-sniffed above; every other Figma MCP tool is classified by name.
const FIGMA_MCP_TOOL_PATTERN = /^mcp__plugin_figma_figma__(?!use_figma$)/

// Write-shaped Figma MCP tools by name: file/asset/mapping creation plus the
// two generator tools (design and FigJam content creation).
const FIGMA_MCP_WRITE_TOOLS = new Set([
  'mcp__plugin_figma_figma__create_new_file',
  'mcp__plugin_figma_figma__upload_assets',
  'mcp__plugin_figma_figma__send_code_connect_mappings',
  'mcp__plugin_figma_figma__add_code_connect_map',
  'mcp__plugin_figma_figma__export_video',
  'mcp__plugin_figma_figma__generate_figma_design',
  'mcp__plugin_figma_figma__generate_diagram'
])

// Non-figma MCP tools have no adapter-owned classification, so a write-shaped
// one (by name only, no argument shape to sniff) must not silently pass
// through as UNCLASSIFIED; a benign-named tool still falls through.
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
 * feed the permission hook. Unrecognized tool names / malformed inputs fall
 * through to `UNCLASSIFIED` (see its doc comment for why that is safe). */
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
