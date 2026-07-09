import type { Finding, GateVerdict } from './gate.js';
/**
 * State store: `~/.argo/state/<project-id>/workflows/<key>.json`, per the
 * design doc's "state store" seam. Sibling to `packages/kit/src/lib/
 * repo-root.ts`'s `resolveRepoRoot` but deliberately NOT imported from there
 * (core has no dependency on kit) — this is the generalized form: project-id
 * is derived from `git rev-parse --git-common-dir`, not `--show-toplevel`, so
 * two worktrees of the same repo (which have different toplevels but share
 * one `.git` common dir) resolve to the same store.
 */
export declare function resolveProjectId(cwd: string): string;
/** Attempt record: one gate-failure round within a stage's retry budget. */
export interface Attempt {
    round: number;
    gate: string;
    findings: Finding[];
    whatWasTried: string;
}
/** History record: one gate run's verdict, appended when a stage is exited. */
export interface HistoryEntry {
    stage: string;
    gate: string;
    at: string;
    verdict: GateVerdict;
    /**
     * Set to `false` by `argo workflow adopt` (audit 2.1) when the stage's gate
     * declared itself non-re-runnable (`GateVerdict.rerunnable === false`), so
     * this entry records "a verdict exists but adopt could not independently
     * re-confirm it" rather than a normal re-verified boundary. Omitted for
     * history entries written by `workflow-advance`, which always runs the
     * gate live.
     */
    verified?: boolean;
}
/** A workflow instance's full on-disk state. */
export interface WorkflowInstance {
    workflow: string;
    target: string;
    stage: string;
    status: string;
    attempts: Attempt[];
    history: HistoryEntry[];
}
export interface StateOptions {
    /** Directory to derive the project-id from. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Root of the state store. Defaults to `~/.argo/state` — override in tests
     * so they never touch the real home directory. */
    stateRoot?: string;
}
export declare function defaultStateRoot(): string;
/** Derives a stable instance key from a workflow name + target, for CLI verbs
 * that start from `{ name, target }` rather than an existing key (`workflow-
 * start`, `workflow-adopt`). Slugified so an arbitrary target string (a
 * screen name, a file path) is always a safe filename component. */
export declare function deriveInstanceKey(workflow: string, target: string): string;
/** Reads an instance by key. Returns `null` — the documented sentinel for "no
 * instance exists yet" — when the file is missing OR malformed (never throws
 * from a read, matching `findArgoJson`'s inert-on-malformed convention). */
export declare function readInstance(key: string, opts?: StateOptions): WorkflowInstance | null;
/** Writes (creates or overwrites) the instance at `key`, creating parent dirs
 * as needed. Whole-instance replace — the append-only guarantee for
 * `attempts`/`history` is enforced by `recordAttempt`/`recordHistory` below,
 * not by this function. */
export declare function writeInstance(key: string, instance: WorkflowInstance, opts?: StateOptions): void;
/** Appends one attempt to `attempts[]` and persists — never mutates or drops
 * a prior entry, only ever grows the array. Throws if no instance exists yet
 * at `key` (callers must `writeInstance` the initial instance first). */
export declare function recordAttempt(key: string, attempt: Attempt, opts?: StateOptions): WorkflowInstance;
/** Appends one entry to `history[]` and persists — same append-only
 * guarantee as `recordAttempt`. */
export declare function recordHistory(key: string, entry: HistoryEntry, opts?: StateOptions): WorkflowInstance;
/** Marks `key` as the project's active workflow instance. */
export declare function setActiveInstance(key: string, opts?: StateOptions): void;
/** Returns the active instance's key, or `null` if no pointer exists or it is
 * malformed (never throws — same inert-on-malformed convention as
 * `readInstance`). */
export declare function getActiveInstanceKey(opts?: StateOptions): string | null;
/** Resolves the active pointer and reads that instance — `null` if there is
 * no active pointer OR the pointed-at instance file is missing/malformed. */
export declare function getActiveInstance(opts?: StateOptions): WorkflowInstance | null;
//# sourceMappingURL=state.d.ts.map