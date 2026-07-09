import type { GateVerdict } from '../gate.js';
import { type StateOptions } from '../state.js';
export interface WorkflowStatusFound {
    found: true;
    key: string;
    workflow: string;
    target: string;
    stage: string;
    status: string;
    /** `true` when the current stage's retry budget is exhausted (`attempts
     * matching the stage's gate >= stage.retries`) or the stored status is
     * already `"stuck"`. */
    stuck: boolean;
    /** Attempts recorded against the CURRENT stage's gate — `attempts[]` is a
     * whole-instance append-only log, so this filters by `gate` (stages
     * usually have distinct gate names) rather than reading `.length` raw,
     * which would double-count budget across earlier, already-passed stages. */
    attemptsInStage: number;
    lastVerdict: GateVerdict | null;
}
export interface WorkflowStatusNotFound {
    found: false;
    key: string;
}
export type WorkflowStatusReport = WorkflowStatusFound | WorkflowStatusNotFound;
/**
 * `argo workflow status` (Slice 5, step 14): reads and formats an instance
 * for display. Never throws for a missing instance — `found: false` is the
 * documented "no active workflow" case (matches `readInstance`'s null
 * sentinel and the design doc's CLI verification wording).
 */
export declare function workflowStatus(key: string, opts?: StateOptions): WorkflowStatusReport;
//# sourceMappingURL=workflow-status.d.ts.map