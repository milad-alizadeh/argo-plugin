import { type StateOptions, type WorkflowInstance } from '../state.js';
export interface WorkflowAdoptInput {
    name: string;
    target: string;
    key?: string;
}
export interface WorkflowAdoptOptions extends StateOptions {
    artifacts?: Record<string, string>;
    settings?: Record<string, unknown>;
}
/**
 * `argo workflow adopt` (Slice 5, step 16; audit 2.1): self-heals an instance
 * after a crash or manual work by walking `spec.stages` in order from the
 * start and RE-RUNNING each stage's declared gate against discovered
 * artifacts — never trusting a `produces` artifact's mere presence. Sets the
 * current stage to the highest CONTIGUOUSLY-passing one. A gate that signals
 * `GateVerdict.rerunnable === false` cannot be safely re-checked out-of-band;
 * adopt stops at that stage and records `verified: false` in `history`
 * instead of advancing past it (regardless of that verdict's `passed` value —
 * an unconfirmable pass is not a safe boundary to advance across either). A
 * stage with no `gate` declared has nothing to re-verify and is treated as a
 * contiguous pass.
 *
 * Rebuilds the instance from scratch: `attempts` resets to `[]` (adopt is a
 * re-derivation of current position, not a resumed retry sequence) and
 * `history` is the fresh trail of gate re-runs performed by this walk, not a
 * merge with any prior instance's history.
 */
export declare function workflowAdopt(input: WorkflowAdoptInput, opts?: WorkflowAdoptOptions): Promise<WorkflowInstance>;
//# sourceMappingURL=workflow-adopt.d.ts.map