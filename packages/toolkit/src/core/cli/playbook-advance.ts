import { resolve } from 'node:path'
import { getGate, type GateContext } from '../gate.js'
import { getPlaybook, type PlaybookSpec } from '../spec.js'
import {
  mutateInstance,
  readInstance,
  recordAttempt,
  recordHistory,
  type StateOptions,
  type PlaybookInstance
} from '../state.js'
import { GateNotFoundError, InstanceNotFoundError, StageNotFoundError, PlaybookNotFoundError } from './errors.js'
import { PLAYBOOK_LIFECYCLE_EVENTS, type PlaybookLifecycleEventRecord } from '../events.js'

export interface PlaybookAdvanceOptions extends StateOptions {
  /** Artifact URIs fed to the stage's gate. Omitted (or `{}`) auto-derives from the stage spec's `produces` entries. */
  artifacts?: Record<string, string>
  /** Settings fed to the stage's gate as `GateInput.settings`. */
  settings?: Record<string, unknown>
  /** Recorded on a failing attempt's `whatWasTried` — freeform, defaults to `''`. */
  whatWasTried?: string
  /** Threaded into `Gate.check` as its `GateContext` argument, so AI-judging gates can reach `ctx.judge(...)`. */
  ctx?: GateContext
}

/**
 * Each `produces` entry is either `"<artifactKey>:<pathTemplate>"` with an
 * explicit key, or a bare path template with no `:` (the key defaults to the
 * template's filename stem). `<key>` in the template is substituted with the
 * playbook instance key, then resolved against `cwd`.
 */
export function deriveArtifactsFromProduces(
  produces: string[] | undefined,
  instanceKey: string,
  cwd: string
): Record<string, string> {
  const artifacts: Record<string, string> = {}
  for (const entry of produces ?? []) {
    const colonIndex = entry.indexOf(':')
    const [name, template] =
      colonIndex === -1 ? [entry.split('/').pop()!.split('.')[0], entry] : [entry.slice(0, colonIndex), entry.slice(colonIndex + 1)]
    const path = template.replace(/<key>/g, instanceKey)
    artifacts[name] = resolve(cwd, path)
  }
  return artifacts
}

/**
 * Rejects a caller-supplied artifact whose key isn't in the stage's
 * produces-derived set, or whose path doesn't match the derived path
 * exactly — otherwise a caller could point the gate at an arbitrary file.
 */
export function validateArtifacts(
  supplied: Record<string, string>,
  derived: Record<string, string>
): Record<string, string> {
  for (const [key, path] of Object.entries(supplied)) {
    if (!(key in derived)) {
      throw new Error(`playbook advance: --artifacts key "${key}" is not declared in this stage's produces`)
    }
    if (resolve(path) !== derived[key]) {
      throw new Error(
        `playbook advance: --artifacts path for "${key}" does not match the produces-derived location (expected "${derived[key]}")`
      )
    }
  }
  return supplied
}

/** The persisted instance plus the lifecycle transitions THIS call caused. */
export type PlaybookAdvanceResult = PlaybookInstance & { events: PlaybookLifecycleEventRecord[] }

/**
 * Runs the current stage's gate, records the verdict to `history`, and
 * either advances `stage` (pass), records an `attempts[]` entry and stays
 * for a retry (fail, budget left), or sets `status: "stuck"` (fail, budget
 * exhausted). A stage with no `gate` advances immediately.
 *
 * Lifecycle events (`events`, not persisted) mirror this: a pass emits
 * `stage_finished` plus `stage_started` or `playbook_finished`. A failing
 * verdict emits none — retry/stuck is carried by `status`/`attempts[]`.
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

  const cwd = (opts.settings?.cwd as string | undefined) ?? opts.cwd ?? process.cwd()
  const derived = deriveArtifactsFromProduces(stageSpec.produces, key, cwd)
  const artifacts = opts.artifacts && Object.keys(opts.artifacts).length > 0 ? validateArtifacts(opts.artifacts, derived) : derived

  const verdict = await gate.check(
    {
      target: instance.target,
      artifacts,
      settings: opts.settings ?? {}
    },
    opts.ctx
  )

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
  // Guarded read-modify-write: a concurrent advance from two sessions must
  // not read the same pre-mutation instance and clobber the other's status.
  const updated = mutateInstance(
    key,
    (current) => ({ ...current, status: round >= budget ? 'stuck' : 'in-progress' }),
    opts
  )
  return { ...updated, events: [] }
}

function advanceToNextStage(
  key: string,
  spec: PlaybookSpec,
  stageIndex: number,
  opts: StateOptions
): PlaybookAdvanceResult {
  const at = new Date().toISOString()
  const finishedStage = spec.stages[stageIndex].name
  const events: PlaybookLifecycleEventRecord[] = [
    { event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_FINISHED, playbook: spec.name, stage: finishedStage, at }
  ]

  const nextStage = spec.stages[stageIndex + 1]
  if (nextStage) {
    events.push({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_STARTED, playbook: spec.name, stage: nextStage.name, at })
  } else {
    events.push({ event: PLAYBOOK_LIFECYCLE_EVENTS.PLAYBOOK_FINISHED, playbook: spec.name, at })
  }

  // Guarded read-modify-write: a concurrent advance must mutate the
  // freshly-locked-read instance, not a copy read before the lock was acquired.
  mutateInstance(
    key,
    (instance) =>
      nextStage
        ? { ...instance, stage: nextStage.name, status: 'in-progress' }
        : { ...instance, status: 'done' },
    opts
  )

  // Every stage transition stamps a `{ stage, at }` history entry for the
  // newly entered (or terminal) stage, so per-stage duration is derivable
  // purely from consecutive `history[].at` values.
  const stamped = recordHistory(key, { stage: nextStage ? nextStage.name : finishedStage, at }, opts)
  return { ...stamped, events }
}
