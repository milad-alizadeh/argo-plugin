import type { GateVerdict } from '../gate.js'
import { getWorkflow } from '../spec.js'
import { readInstance, type StateOptions } from '../state.js'

export interface WorkflowStatusFound {
  found: true
  key: string
  workflow: string
  target: string
  stage: string
  status: string
  /** `true` when the current stage's retry budget is exhausted (`attempts
   * matching the stage's gate >= stage.retries`) or the stored status is
   * already `"stuck"`. */
  stuck: boolean
  /** Attempts recorded against the CURRENT stage's gate — `attempts[]` is a
   * whole-instance append-only log, so this filters by `gate` (stages
   * usually have distinct gate names) rather than reading `.length` raw,
   * which would double-count budget across earlier, already-passed stages. */
  attemptsInStage: number
  lastVerdict: GateVerdict | null
}

export interface WorkflowStatusNotFound {
  found: false
  key: string
}

export type WorkflowStatusReport = WorkflowStatusFound | WorkflowStatusNotFound

/**
 * `argo workflow status` (Slice 5, step 14): reads and formats an instance
 * for display. Never throws for a missing instance — `found: false` is the
 * documented "no active workflow" case (matches `readInstance`'s null
 * sentinel and the design doc's CLI verification wording).
 */
export function workflowStatus(key: string, opts: StateOptions = {}): WorkflowStatusReport {
  const instance = readInstance(key, opts)
  if (!instance) return { found: false, key }

  const spec = getWorkflow(instance.workflow)
  const stageSpec = spec?.stages.find((s) => s.name === instance.stage)
  const attemptsInStage = stageSpec ? instance.attempts.filter((a) => a.gate === stageSpec.gate).length : 0
  const budget = stageSpec?.retries
  const stuck = instance.status === 'stuck' || (budget !== undefined && attemptsInStage >= budget)

  return {
    found: true,
    key,
    workflow: instance.workflow,
    target: instance.target,
    stage: instance.stage,
    status: instance.status,
    stuck,
    attemptsInStage,
    lastVerdict: instance.history.length > 0 ? instance.history[instance.history.length - 1].verdict : null
  }
}
