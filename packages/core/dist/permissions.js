import { homedir } from 'node:os';
/**
 * Action-kind membership + protected-path checks, per audit 1.1 (protected
 * machine-trust surfaces by path, not just action kind) and 1.2 (deny
 * destructive git operations by default). Core only names the rules here —
 * enforcement (the PreToolUse hook, the git-command-string classifier) lives
 * in `adapter-claude`, per the audit's "core-owned list, adapter-owned
 * enforcement" split.
 */
/** Plain string-equality membership check against a stage's `allows` list —
 * deliberately no domain enumeration of action kinds here, so new kinds
 * (like `GIT_HISTORY_MUTATION` below) need no change to this function. An
 * empty `allows` denies everything, matching deny-by-default. */
export function isActionAllowed(actionKind, stageAllows) {
    return stageAllows.includes(actionKind);
}
/** Action kind covering `git reset`, `commit --amend`, `rebase`, `checkout --
 * <path>`, `filter-branch`, and similar history-rewriting operations (audit
 * 1.2). Classified by the adapter's git-command-string parser and denied
 * unless a stage's `allows` explicitly opts in — no stage in the six code
 * workflows does. */
export const GIT_HISTORY_MUTATION = 'git-history-mutation';
function toSegments(path) {
    const expanded = path.startsWith('~') ? homedir() + path.slice(1) : path;
    return expanded.split(/[\\/]+/).filter(Boolean);
}
function parsePattern(pattern) {
    const isWildcardDir = pattern.endsWith('/**');
    const base = isWildcardDir ? pattern.slice(0, -'/**'.length) : pattern;
    return { segments: toSegments(base), isWildcardDir };
}
/** Default-deny surfaces the working-agent role must never write through the
 * generic tool path, regardless of stage `allows` — evaluated *before* the
 * stage's own allow-list (audit 1.1). `probity.config.ts` sits at repo root,
 * OUTSIDE `.argo/`, so it's listed as its own pattern rather than folded
 * into a `.argo/`-prefix rule that would miss it. */
const PROTECTED_PATTERNS = [
    parsePattern('~/.argo/state/**'),
    parsePattern('.argo/config.json'),
    parsePattern('probity.config.ts'),
    parsePattern('registry.json'),
    parsePattern('manifests/**')
];
function matchesFixed(pathSegments, patternSegments) {
    if (patternSegments.length > pathSegments.length)
        return false;
    const offset = pathSegments.length - patternSegments.length;
    return patternSegments.every((seg, i) => pathSegments[offset + i] === seg);
}
function matchesWildcardDir(pathSegments, patternSegments) {
    for (let i = 0; i + patternSegments.length <= pathSegments.length; i++) {
        const dirMatches = patternSegments.every((seg, j) => pathSegments[i + j] === seg);
        // require at least one more segment nested under the matched directory —
        // the directory itself (with nothing under it) is not "everything under it"
        if (dirMatches && i + patternSegments.length < pathSegments.length)
            return true;
    }
    return false;
}
/** True if `path` falls under one of the core-owned protected surfaces
 * (state store, config, probity config, registry, manifests) — matched by
 * trailing path segments so both relative and absolute forms of the same
 * path match, without matching an adjacent non-protected path (e.g.
 * `.argo/design/brief.md` does not match `.argo/config.json`). */
export function isProtectedPath(path) {
    const segments = toSegments(path);
    return PROTECTED_PATTERNS.some(({ segments: patternSegments, isWildcardDir }) => isWildcardDir ? matchesWildcardDir(segments, patternSegments) : matchesFixed(segments, patternSegments));
}
//# sourceMappingURL=permissions.js.map