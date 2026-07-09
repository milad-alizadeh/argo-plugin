/**
 * Named error classes shared by the CLI verbs (Slice 5), so callers (kit's
 * `bin/argo.js` switch, later) can `instanceof`-branch on a specific failure
 * mode instead of string-matching messages.
 */

export class WorkflowNotFoundError extends Error {
  constructor(public readonly workflowName: string) {
    super(`no workflow registered under the name "${workflowName}" — a pack must call registerWorkflow first`)
    this.name = 'WorkflowNotFoundError'
  }
}

export class InstanceNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`no workflow instance at key "${key}" — start one first`)
    this.name = 'InstanceNotFoundError'
  }
}

export class StageNotFoundError extends Error {
  constructor(
    public readonly stageName: string,
    public readonly workflowName: string
  ) {
    super(`workflow "${workflowName}" has no stage named "${stageName}"`)
    this.name = 'StageNotFoundError'
  }
}

export class GateNotFoundError extends Error {
  constructor(public readonly gateName: string) {
    super(`no gate registered under the name "${gateName}" — a pack must call registerGate first`)
    this.name = 'GateNotFoundError'
  }
}
