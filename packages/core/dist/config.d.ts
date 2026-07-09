/**
 * `.argo/config.json` reader — the new home for `packs`/`noWorkflow`/
 * `testDiscipline`/`land`, per the plan's open question 1 (`.claude/argo.json`
 * stays untouched, read separately by the existing design-guard gates for
 * their own `design.<app>` block — this module never reads or writes that
 * file). Deliberately a NEW, separate module from `packages/kit/src/config/
 * argo-json.ts`'s `findArgoJson` — same walk-up-to-nearest-file idiom, but a
 * different file (`.argo/config.json`, not `.claude/argo.json`) and a
 * different shape, so it is not imported from here.
 *
 * Read LIVE per call — no session-start cache, per the settled decision (a
 * config edit mid-session must take effect on the next hook invocation).
 * Missing file or malformed JSON both resolve to defaults, never a throw —
 * this will be called from a PreToolUse hook path (adapter-claude, later
 * slice) where a thrown config reader would fail a tool call for an
 * unrelated reason.
 */
/** Per-pack enabled/disabled map, e.g. `{ "pack-design": true, "pack-code": false }`.
 * A pack absent from this map is treated as disabled (deny-by-default) —
 * see `assertPackAvailable`. Default: `{}` (every pack disabled). */
export type PackAvailability = Record<string, boolean>;
export interface ArgoConfig {
    /** Which packs are installed/enabled. Default: `{}`. */
    packs: PackAvailability;
    /** Behavior when no workflow instance is active for the current target.
     * `"allow"` passes every tool call through unconditionally; `"deny-edits"`
     * blocks file-edit-shaped action kinds and coaches the agent to start a
     * workflow first (enforced by adapter-claude's hook, not here). Default:
     * `"allow"` — the one default explicitly named in the design doc. */
    noWorkflow: 'allow' | 'deny-edits';
    /** Reserved for pack-code's TDD policies (`test-first`/`reproduce-first`/
     * `tests-stay-green`) — phase 2. Default: `undefined` (no discipline
     * configured; meaningless without pack-code to enforce it). */
    testDiscipline?: unknown;
    /** Reserved for the `land` workflow's settings (`land.mode`) — phase 2.
     * Default: `undefined` (no land config; the workflow doesn't exist yet). */
    land?: unknown;
}
/** Reads `.argo/config.json` live (no caching), walking up from `cwd`
 * (defaults to `process.cwd()`) to the nearest match. Missing file or
 * malformed JSON both resolve to `DEFAULT_CONFIG` — never throws. Keys
 * absent from a present-but-partial file fall back to their individual
 * defaults (a file with only `{ "noWorkflow": "deny-edits" }` still reads
 * `packs` as `{}`). */
export declare function readConfig(cwd?: string): ArgoConfig;
/** Thrown by `assertPackAvailable` when a workflow's terminal stage hands off
 * to a pack that is disabled (or absent) in config — named so callers
 * (`workflow-start.ts`, Slice 5) can distinguish it from other start-time
 * errors. */
export declare class PackUnavailableError extends Error {
    readonly workflowName: string;
    readonly requiredPack: string;
    constructor(workflowName: string, requiredPack: string);
}
/** Refuses a cross-pack workflow at start time when its terminal stage hands
 * off to a disabled pack (audit 2.4) — e.g. pack-design's `design-to-code`
 * handing off to pack-code's `screen-implement`. Called once at
 * `workflow-start.ts` time, never mid-run: a pack that gets disabled after a
 * workflow is already in flight is not re-checked here. A pack absent from
 * `config.packs` is treated as disabled (deny-by-default), matching
 * `PackAvailability`'s documented default. */
export declare function assertPackAvailable(workflowName: string, requiredPack: string, config: ArgoConfig): void;
//# sourceMappingURL=config.d.ts.map