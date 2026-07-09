/**
 * Named error classes shared by the CLI verbs (Slice 5), so callers (kit's
 * `bin/argo.js` switch, later) can `instanceof`-branch on a specific failure
 * mode instead of string-matching messages.
 */
export class WorkflowNotFoundError extends Error {
    workflowName;
    constructor(workflowName) {
        super(`no workflow registered under the name "${workflowName}" — a pack must call registerWorkflow first`);
        this.workflowName = workflowName;
        this.name = 'WorkflowNotFoundError';
    }
}
export class InstanceNotFoundError extends Error {
    key;
    constructor(key) {
        super(`no workflow instance at key "${key}" — start one first`);
        this.key = key;
        this.name = 'InstanceNotFoundError';
    }
}
export class StageNotFoundError extends Error {
    stageName;
    workflowName;
    constructor(stageName, workflowName) {
        super(`workflow "${workflowName}" has no stage named "${stageName}"`);
        this.stageName = stageName;
        this.workflowName = workflowName;
        this.name = 'StageNotFoundError';
    }
}
export class GateNotFoundError extends Error {
    gateName;
    constructor(gateName) {
        super(`no gate registered under the name "${gateName}" — a pack must call registerGate first`);
        this.gateName = gateName;
        this.name = 'GateNotFoundError';
    }
}
//# sourceMappingURL=errors.js.map