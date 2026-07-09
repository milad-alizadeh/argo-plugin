import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
/**
 * State store: `~/.argo/state/<project-id>/workflows/<key>.json`, per the
 * design doc's "state store" seam. Sibling to `packages/kit/src/lib/
 * repo-root.ts`'s `resolveRepoRoot` but deliberately NOT imported from there
 * (core has no dependency on kit) — this is the generalized form: project-id
 * is derived from `git rev-parse --git-common-dir`, not `--show-toplevel`, so
 * two worktrees of the same repo (which have different toplevels but share
 * one `.git` common dir) resolve to the same store.
 */
export function resolveProjectId(cwd) {
    const identity = gitCommonDirIdentity(cwd) ?? resolve(cwd);
    return createHash('sha1').update(identity).digest('hex');
}
function gitCommonDirIdentity(cwd) {
    try {
        const commonDir = execFileSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'], {
            encoding: 'utf8'
        }).trim();
        if (!commonDir)
            return null;
        const resolved = resolve(cwd, commonDir);
        // Git resolves symlinks inconsistently between the plain-repo case
        // (relative ".git", resolved against whatever `cwd` we were given) and
        // the worktree case (an absolute path git itself already realpath'd) —
        // e.g. macOS's /tmp -> /private/tmp. realpath both so a worktree and its
        // main repo checkout (same underlying `.git` dir) always match.
        try {
            return realpathSync(resolved);
        }
        catch {
            return resolved;
        }
    }
    catch {
        return null; // not a git repo — fall back to cwd identity
    }
}
export function defaultStateRoot() {
    return join(homedir(), '.argo', 'state');
}
/** Derives a stable instance key from a workflow name + target, for CLI verbs
 * that start from `{ name, target }` rather than an existing key (`workflow-
 * start`, `workflow-adopt`). Slugified so an arbitrary target string (a
 * screen name, a file path) is always a safe filename component. */
export function deriveInstanceKey(workflow, target) {
    const slug = (value) => value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '') || 'x';
    return `${slug(workflow)}--${slug(target)}`;
}
function instancePath(key, opts = {}) {
    const projectId = resolveProjectId(opts.cwd ?? process.cwd());
    const stateRoot = opts.stateRoot ?? defaultStateRoot();
    return join(stateRoot, projectId, 'workflows', `${key}.json`);
}
/** Reads an instance by key. Returns `null` — the documented sentinel for "no
 * instance exists yet" — when the file is missing OR malformed (never throws
 * from a read, matching `findArgoJson`'s inert-on-malformed convention). */
export function readInstance(key, opts = {}) {
    const path = instancePath(key, opts);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Writes (creates or overwrites) the instance at `key`, creating parent dirs
 * as needed. Whole-instance replace — the append-only guarantee for
 * `attempts`/`history` is enforced by `recordAttempt`/`recordHistory` below,
 * not by this function. */
export function writeInstance(key, instance, opts = {}) {
    const path = instancePath(key, opts);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(instance, null, 2));
}
/** Appends one attempt to `attempts[]` and persists — never mutates or drops
 * a prior entry, only ever grows the array. Throws if no instance exists yet
 * at `key` (callers must `writeInstance` the initial instance first). */
export function recordAttempt(key, attempt, opts = {}) {
    const instance = readInstance(key, opts);
    if (!instance)
        throw new Error(`no instance for key "${key}" — writeInstance first`);
    const updated = { ...instance, attempts: [...instance.attempts, attempt] };
    writeInstance(key, updated, opts);
    return updated;
}
/** Appends one entry to `history[]` and persists — same append-only
 * guarantee as `recordAttempt`. */
export function recordHistory(key, entry, opts = {}) {
    const instance = readInstance(key, opts);
    if (!instance)
        throw new Error(`no instance for key "${key}" — writeInstance first`);
    const updated = { ...instance, history: [...instance.history, entry] };
    writeInstance(key, updated, opts);
    return updated;
}
/**
 * "Active instance" pointer — `<stateRoot>/<projectId>/active-workflow.json`
 * containing `{ key }`. There is no other project-wide way to answer "which
 * instance is active right now" for a hook that only sees a `cwd`, not a
 * `{ workflow, target }` pair: `deriveInstanceKey` is deterministic GIVEN a
 * target, but the target itself (a screen name, a branch) isn't observable
 * from a generic PreToolUse tool call. `workflow-start` (and `adopt`) write
 * this pointer so the last-started/adopted instance is what the permission
 * hook (adapter-claude's `runPermissionHook`, wired in `@argohq/kit`) reads
 * as "the" active instance for the project. Single-pointer, not a stack: only
 * one workflow instance is "active" at a time per project, matching the
 * design doc's single-active-workflow model for phase 1.
 */
function activePointerPath(opts = {}) {
    const projectId = resolveProjectId(opts.cwd ?? process.cwd());
    const stateRoot = opts.stateRoot ?? defaultStateRoot();
    return join(stateRoot, projectId, 'active-workflow.json');
}
/** Marks `key` as the project's active workflow instance. */
export function setActiveInstance(key, opts = {}) {
    const path = activePointerPath(opts);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ key }, null, 2));
}
/** Returns the active instance's key, or `null` if no pointer exists or it is
 * malformed (never throws — same inert-on-malformed convention as
 * `readInstance`). */
export function getActiveInstanceKey(opts = {}) {
    const path = activePointerPath(opts);
    if (!existsSync(path))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        return typeof parsed?.key === 'string' ? parsed.key : null;
    }
    catch {
        return null;
    }
}
/** Resolves the active pointer and reads that instance — `null` if there is
 * no active pointer OR the pointed-at instance file is missing/malformed. */
export function getActiveInstance(opts = {}) {
    const key = getActiveInstanceKey(opts);
    if (!key)
        return null;
    return readInstance(key, opts);
}
//# sourceMappingURL=state.js.map