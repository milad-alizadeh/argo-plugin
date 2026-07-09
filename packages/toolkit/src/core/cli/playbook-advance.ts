import { getGate } from '../gate.js'
import { getPlaybook, type PlaybookSpec } from '../spec.js'
import {
  readInstance,
  recordAttempt,
  recordHistory,
  writeInstance,
  type StateOptions,
  type PlaybookInstance
} from '../state.js'
import { GateNotFoundError, InstanceNotFoundError, StageNotFoundError, PlaybookNotFoundError } from './errors.js'
import { PLAYBOOK_LIFECYCLE_EVENTS, type PlaybookLifecycleEventRecord } from '../events.js'

export interface PlaybookAdvanceOptions extends StateOptions {
  /** Artifact URIs fed to the stage's gate as `GateInput.artifacts`. */
  artifacts?: Record<string, string>
  /** Settings fed to the stage's gate as `GateInput.settings`. */
  settings?: Record<string, unknown>
  /** Recorded on a failing attempt's `whatWasTried` — freeform, defaults to `''`. */
  whatWasTried?: string
}

/** The persisted instance plus the lifecycle transitions THIS call caused. */
export type PlaybookAdvanceResult = PlaybookInstance & { events: PlaybookLifecycleEventRecord[] }

/**
 * `argo playbook advance` (Slice 5, step 15): runs the current stage's gate,
 * records the verdict to `history`, and either advances `stage` (pass),
 * records an `attempts[]` entry and stays for a retry (fail, budget left), or
 * parks `status: "stuck"` (fail, budget exhausted). A stage with no `gate`
 * declared advances immediately (nothing to check at its exit).
 *
 * Lifecycle events (`events`, NOT persisted — the state file stays the
 * durable record): a pass emits `stage_finished` plus `stage_started` for the
 * next stage or `playbook_finished` on the terminal stage. A failing verdict
 * emits no lifecycle event — retry/stuck is carried by `status`/`attempts[]`.
 */
export async function playbookAdvance(key: string, opts: PlaybookAdvanceOptions = {}): Promise<PlaybookAdvanceResult> {
  const instance = readInstance(key, opts)
  if (!instance) throw new InstanceNotFoundError(key)

  const spec = getPlaybook(instance.playbook)
  if (!spec) throw new PlaybookNotFoundError(instance.playbook)

  const stageIndex = spec.stages.findIndex((s) => s.name === instance.stage)
  const stageSpec = spec.stages[stageIndex]
  if (!stageSpec) throw new StageNotFoundError(instance.stage, instance.playbook)

  if (!stageSpec.gate) {
    return advanceToNextStage(key, spec, stageIndex, opts)
  }

  const gate = getGate(stageSpec.gate)
  if (!gate) throw new GateNotFoundError(stageSpec.gate)

  const verdict = await gate.check({
    target: instance.target,
    artifacts: opts.artifacts ?? {},
    settings: opts.settings ?? {}
  })

  recordHistory(key, { stage: stageSpec.name, gate: stageSpec.gate, at: new Date().toISOString(), verdict }, opts)

  if (verdict.passed) {
    return advanceToNextStage(key, spec, stageIndex, opts)
  }

  // Fail: attempts[] is a whole-instance append-only log, so scope the
  // budget check to attempts recorded against THIS stage's gate — otherwise
  // an earlier, already-passed stage's failed attempts would count against
  // a later stage's budget.
  const attemptsSoFar = instance.attempts.filter((a) => a.gate === stageSpec.gate).length
  const round = attemptsSoFar + 1
  recordAttempt(
    key,
    { round, gate: stageSpec.gate, findings: verdict.findings, whatWasTried: opts.whatWasTried ?? '' },
    opts
  )

  const budget = stageSpec.retries ?? 0
  const updated = readInstance(key, opts)
  if (!updated) throw new InstanceNotFoundError(key) // unreachable: we just wrote it
  updated.status = round >= budget ? 'stuck' : 'in-progress'
  writeInstance(key, updated, opts)
  return { ...updated, events: [] }
}

function advanceToNextStage(
  key: string,
  spec: PlaybookSpec,
  stageIndex: number,
  opts: StateOptions
): PlaybookAdvanceResult {
  const instance = readInstance(key, opts)
  if (!instance) throw new InstanceNotFoundError(key)

  const at = new Date().toISOString()
  const finishedStage = spec.stages[stageIndex].name
  const events: PlaybookLifecycleEventRecord[] = [
    { event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_FINISHED, playbook: spec.name, stage: finishedStage, at }
  ]

  const nextStage = spec.stages[stageIndex + 1]
  if (nextStage) {
    instance.stage = nextStage.name
    instance.status = 'in-progress'
    events.push({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_STARTED, playbook: spec.name, stage: nextStage.name, at })
  } else {
    instance.status = 'done'
    events.push({ event: PLAYBOOK_LIFECYCLE_EVENTS.PLAYBOOK_FINISHED, playbook: spec.name, at })
  }
  writeInstance(key, instance, opts)
  return { ...instance, events }
}
