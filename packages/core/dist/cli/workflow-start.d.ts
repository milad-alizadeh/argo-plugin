import { type StateOptions, type WorkflowInstance } from '../state.js';
export interface WorkflowStartInput {
    /** Name of a spec previously registered via `registerWorkflow`. */
    name: string;
    /** The artifact/screen/branch this instance tracks — fed to `deriveInstanceKey`. */
    target: string;
    /** Override the derived instance key (rarely needed — mostly for tests wanting a stable key). */
    key?: string;
}
export interface WorkflowStartResult {
    key: string;
    instance: WorkflowInstance;
}
/**
 * `argo workflow start` (Slice 5, step 13): resolves `input.name` against the
 * spec registry, refuses at start time (never mid-run, audit 2.4) if the
 * spec's terminal stage hands off to a disabled pack, then writes the initial
 * instance at the first stage.
 */
export declare function workflowStart(input: WorkflowStartInput, opts?: StateOptions): WorkflowStartResult;
//# sourceMappingURL=workflow-start.d.ts.map