/** Lets callers `instanceof`-branch on a specific failure mode instead of string-matching messages. */
export class PlaybookNotFoundError extends Error {
  constructor(public readonly playbookName: string) {
    super(`no playbook registered under the name "${playbookName}" — a pack must call registerPlaybook first`)
    this.name = 'PlaybookNotFoundError'
  }
}

export class InstanceNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`no playbook instance at key "${key}" — start one first`)
    this.name = 'InstanceNotFoundError'
  }
}

export class StageNotFoundError extends Error {
  constructor(
    public readonly stageName: string,
    public readonly playbookName: string
  ) {
    super(`playbook "${playbookName}" has no stage named "${stageName}"`)
    this.name = 'StageNotFoundError'
  }
}

export class GateNotFoundError extends Error {
  constructor(public readonly gateName: string) {
    super(`no gate registered under the name "${gateName}" — a pack must call registerGate first`)
    this.name = 'GateNotFoundError'
  }
}
