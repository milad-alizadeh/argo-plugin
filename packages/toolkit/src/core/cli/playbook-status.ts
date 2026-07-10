import type { GateVerdict } from '../gate.js'
import { getPlaybook } from '../spec.js'
import { readInstance, type StateOptions } from '../state.js'

export interface PlaybookStatusFound {
  found: true
  key: string
  playbook: string
  target: string
  stage: string
  status: string
  /** `true` when the current stage's retry budget is exhausted (`attempts
   * matching the stage's gate >= stage.retries`) or the stored status is
   * already `"stuck"`. */
  stuck: boolean
  /** Attempts recorded against the CURRENT stage's gate — `attempts[]` is a
   * whole-instance append-only log, so counting raw `.length` would
   * double-count budget across earlier, already-passed stages. */
  attemptsInStage: number
  lastVerdict: GateVerdict | null
  /** ISO timestamp the instance was started at (`playbookStart`'s `startedAt`),
   * so `argo playbook status` can surface per-run wall-clock age. Omitted for
   * instances written before this field existed. */
  startedAt?: string
}

export interface PlaybookStatusNotFound {
  found: false
  key: string
}

export type PlaybookStatusReport = PlaybookStatusFound | PlaybookStatusNotFound

/**
 * Reads and formats an instance for display. Never throws for a missing
 * instance — `found: false` is the documented "no active playbook" case.
 */
export function playbookStatus(key: string, opts: StateOptions = {}): PlaybookStatusReport {
  const instance = readInstance(key, opts)
  if (!instance) return { found: false, key }

  const spec = getPlaybook(instance.playbook)
  const stageSpec = spec?.stages.find((s) => s.name === instance.stage)
  const attemptsInStage = stageSpec ? instance.attempts.filter((a) => a.gate === stageSpec.gate).length : 0
  const budget = stageSpec?.retries
  const stuck = instance.status === 'stuck' || (budget !== undefined && attemptsInStage >= budget)

  return {
    found: true,
    key,
    playbook: instance.playbook,
    target: instance.target,
    stage: instance.stage,
    status: instance.status,
    stuck,
    attemptsInStage,
    // Most recent history entry that actually carries a verdict — a
    // gateless-stage transition stamp has no `verdict` and must not shadow
    // the last real one.
    lastVerdict: [...instance.history].reverse().find((h) => h.verdict !== undefined)?.verdict ?? null,
    startedAt: instance.startedAt
  }
}
