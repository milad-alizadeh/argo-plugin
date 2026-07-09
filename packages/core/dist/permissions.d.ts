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
export declare function isActionAllowed(actionKind: string, stageAllows: string[]): boolean;
/** Action kind covering `git reset`, `commit --amend`, `rebase`, `checkout --
 * <path>`, `filter-branch`, and similar history-rewriting operations (audit
 * 1.2). Classified by the adapter's git-command-string parser and denied
 * unless a stage's `allows` explicitly opts in — no stage in the six code
 * workflows does. */
export declare const GIT_HISTORY_MUTATION = "git-history-mutation";
/** True if `path` falls under one of the core-owned protected surfaces
 * (state store, config, probity config, registry, manifests) — matched by
 * trailing path segments so both relative and absolute forms of the same
 * path match, without matching an adjacent non-protected path (e.g.
 * `.argo/design/brief.md` does not match `.argo/config.json`). */
export declare function isProtectedPath(path: string): boolean;
//# sourceMappingURL=permissions.d.ts.map