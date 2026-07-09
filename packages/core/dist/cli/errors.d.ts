/**
 * Named error classes shared by the CLI verbs (Slice 5), so callers (kit's
 * `bin/argo.js` switch, later) can `instanceof`-branch on a specific failure
 * mode instead of string-matching messages.
 */
export declare class WorkflowNotFoundError extends Error {
    readonly workflowName: string;
    constructor(workflowName: string);
}
export declare class InstanceNotFoundError extends Error {
    readonly key: string;
    constructor(key: string);
}
export declare class StageNotFoundError extends Error {
    readonly stageName: string;
    readonly workflowName: string;
    constructor(stageName: string, workflowName: string);
}
export declare class GateNotFoundError extends Error {
    readonly gateName: string;
    constructor(gateName: string);
}
//# sourceMappingURL=errors.d.ts.map