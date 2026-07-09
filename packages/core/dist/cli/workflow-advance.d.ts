import { type StateOptions, type WorkflowInstance } from '../state.js';
export interface WorkflowAdvanceOptions extends StateOptions {
    /** Artifact URIs fed to the stage's gate as `GateInput.artifacts`. */
    artifacts?: Record<string, string>;
    /** Settings fed to the stage's gate as `GateInput.settings`. */
    settings?: Record<string, unknown>;
    /** Recorded on a failing attempt's `whatWasTried` — freeform, defaults to `''`. */
    whatWasTried?: string;
}
/**
 * `argo workflow advance` (Slice 5, step 15): runs the current stage's gate,
 * records the verdict to `history`, and either advances `stage` (pass),
 * records an `attempts[]` entry and stays for a retry (fail, budget left), or
 * parks `status: "stuck"` (fail, budget exhausted). A stage with no `gate`
 * declared advances immediately (nothing to check at its exit).
 */
export declare function workflowAdvance(key: string, opts?: WorkflowAdvanceOptions): Promise<WorkflowInstance>;
//# sourceMappingURL=workflow-advance.d.ts.map