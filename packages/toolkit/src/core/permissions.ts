import { homedir } from 'node:os'

/**
 * Action-kind membership + protected-path checks. Core only names the rules
 * here; enforcement (the PreToolUse hook, the git-command-string classifier)
 * lives in `adapter-claude`.
 */

/** No domain enumeration of action kinds here, so new kinds need no change to
 * this function. An empty `allows` denies everything, matching deny-by-default. */
export function isActionAllowed(actionKind: string, stageAllows: string[]): boolean {
  return stageAllows.includes(actionKind)
}

/** Covers `git reset`, `commit --amend`, `rebase`, `checkout -- <path>`,
 * `filter-branch`, and similar history-rewriting operations. Denied unless a
 * stage's `allows` explicitly opts in — no stage in the six code playbooks does. */
export const GIT_HISTORY_MUTATION = 'git-history-mutation'

interface ProtectedPattern {
  /** Path segments to match, home-expanded already for `~`-anchored patterns. */
  segments: string[]
  /** Whether the pattern is a `**`-suffixed directory (matches anything
   * nested under `segments`) vs. a fixed path/basename (matches as a
   * trailing suffix of the target path). */
  isWildcardDir: boolean
}

function toSegments(path: string): string[] {
  const expanded = path.startsWith('~') ? homedir() + path.slice(1) : path
  return expanded.split(/[\\/]+/).filter(Boolean)
}

function parsePattern(pattern: string): ProtectedPattern {
  const isWildcardDir = pattern.endsWith('/**')
  const base = isWildcardDir ? pattern.slice(0, -'/**'.length) : pattern
  return { segments: toSegments(base), isWildcardDir }
}

/** Default-deny surfaces the working-agent role must never write through the
 * generic tool path, evaluated before the stage's own allow-list.
 * `probity.config.ts` sits at repo root, outside `.argo/`, so it's its own
 * pattern rather than folded into a `.argo/`-prefix rule that would miss it.
 * `registry.json`/`manifests/**` require a `design/` ancestor segment (not a
 * bare basename/dir match anywhere in the tree) so this never matches a host
 * project's own unrelated `registry.json`/`manifests/` that happens to share
 * the name, a real false-positive found in the wild that permanently blocked
 * a host's own files. */
const PROTECTED_PATTERNS: ProtectedPattern[] = [
  parsePattern('~/.argo/state/**'),
  parsePattern('.argo/config.json'),
  parsePattern('probity.config.ts'),
  parsePattern('design/registry.json'),
  parsePattern('design/manifests/**')
]

function matchesFixed(pathSegments: string[], patternSegments: string[]): boolean {
  if (patternSegments.length > pathSegments.length) return false
  const offset = pathSegments.length - patternSegments.length
  return patternSegments.every((seg, i) => pathSegments[offset + i] === seg)
}

function matchesWildcardDir(pathSegments: string[], patternSegments: string[]): boolean {
  for (let i = 0; i + patternSegments.length <= pathSegments.length; i++) {
    const dirMatches = patternSegments.every((seg, j) => pathSegments[i + j] === seg)
    // require at least one more segment nested under the matched directory —
    // the directory itself (with nothing under it) is not "everything under it"
    if (dirMatches && i + patternSegments.length < pathSegments.length) return true
  }
  return false
}

/** True if `path` falls under a core-owned protected surface (state store,
 * config, probity config, registry, manifests), matched by trailing path
 * segments so relative and absolute forms both match without matching an
 * adjacent non-protected path. */
export function isProtectedPath(path: string): boolean {
  const segments = toSegments(path)
  return PROTECTED_PATTERNS.some(({ segments: patternSegments, isWildcardDir }) =>
    isWildcardDir ? matchesWildcardDir(segments, patternSegments) : matchesFixed(segments, patternSegments)
  )
}
