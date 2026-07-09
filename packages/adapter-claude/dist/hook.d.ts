import { type ArgoConfig, type WorkflowInstance } from '@argohq/core';
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
    tool_name: string;
    tool_input: unknown;
    cwd?: string;
}
/** Callback the hook body uses to obtain the currently-active workflow
 * instance for this session/target, or `null` if none is active. Injected
 * rather than called directly against `core`'s state store so Slice 8 can
 * decide the caching/session-scoping strategy without this module changing
 * shape. */
export type ActiveInstanceReader = () => WorkflowInstance | null;
export type HookDecision = {
    decision: 'allow';
} | {
    decision: 'deny';
    reason: string;
};
/**
 * The PreToolUse hook body. Order (per the design doc + audit 1.1's fix):
 *
 * 1. Protected-path check — UNCONDITIONAL, before anything else, regardless
 *    of whether a workflow instance is active or what a stage's `allows`
 *    says. This is audit 1.1: a stage whose `allows` includes `file-edit`
 *    must never be able to write a protected path.
 * 2. Read the active instance. No active instance ⇒ `config.noWorkflow`
 *    decides: `"allow"` passes everything through; `"deny-edits"` blocks
 *    edit-shaped action kinds with a coaching message to start a workflow.
 * 3. An active instance ⇒ resolve its stage's `allows` (fail closed if the
 *    workflow/stage can't be resolved — an instance pointing at an unknown
 *    workflow or stage name is treated as a denial, never a silent allow).
 * 4. Classify the tool call, membership-check it against `allows`, deny
 *    with a message naming the stage, the violated rule, and (when
 *    derivable) the correct path.
 */
export declare function runPermissionHook(input: HookInput, config: ArgoConfig, readActiveInstance: ActiveInstanceReader): HookDecision;
//# sourceMappingURL=hook.d.ts.map