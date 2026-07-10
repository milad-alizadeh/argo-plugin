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
  /** Artifact URIs fed to the stage's gate as `GateInput.artifacts`. When
   * omitted (or `{}`), artifacts are auto-derived from the stage spec's
   * `produces` entries — see `deriveArtifactsFromProduces` below. */
  artifacts?: Record<string, string>
  /** Settings fed to the stage's gate as `GateInput.settings`. */
  settings?: Record<string, unknown>
  /** Recorded on a failing attempt's `whatWasTried` — freeform, defaults to `''`. */
  whatWasTried?: string
  /** Threaded into `Gate.check` as its second (`GateContext`) argument, so
   * AI-judging gates (`fresh-eyes-review`) can reach `ctx.judge(...)`. */
  ctx?: GateContext
}

/**
 * Auto-derivation convention (item 1's filesystem convention, so `--artifacts`
 * is rarely needed): each `StageSpec.produces` entry is either
 *   - `"<artifactKey>:<pathTemplate>"` — an explicit key, e.g.
 *     `"brief:briefs/<key>.md"`, or
 *   - a bare path template with no `:` — the artifact key defaults to the
 *     template's filename stem (before the first `.`), e.g. `"notes.md"` ->
 *     key `"notes"`.
 * `<key>` inside the template is substituted with the playbook instance key.
 * The resolved path is resolved against `cwd` (settings.cwd, falling back to
 * the advance call's own `cwd`) so gates that `resolve(cwd, artifacts[key])`
 * (e.g. `brief-check`) get the same file regardless of their own cwd default.
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
 * Validates caller-supplied `--artifacts` against the stage's `produces`-
 * derived set (finding #3): a caller could otherwise substitute a doctored
 * path for any artifact key and point the gate at an arbitrary file. Every
 * supplied key must be one `deriveArtifactsFromProduces` would itself
 * produce, AND its path must match that derived path exactly — the artifact
 * locations are a filesystem convention, not caller-choosable input.
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
  // Guarded read-modify-write (audit finding — was a bare read+write here,
  // unlike recordAttempt/recordHistory above): a concurrent advance from two
  // sessions must not read the same pre-mutation instance and have one
  // writer's status transition silently overwrite the other's.
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

  // Guarded read-modify-write — same lost-update risk as the fail path above:
  // a concurrent advance must mutate the freshly-locked-read instance, not a
  // copy read before the lock was acquired.
  mutateInstance(
    key,
    (instance) =>
      nextStage
        ? { ...instance, stage: nextStage.name, status: 'in-progress' }
        : { ...instance, status: 'done' },
    opts
  )

  // Measurement (item 4): every stage transition — gated or gateless auto-
  // advance alike — stamps a `{ stage, at }` history entry for the newly
  // entered (or terminal) stage, so per-stage wall-clock duration is
  // derivable purely from consecutive `history[].at` values in the state
  // file. A gated pass already recorded the FINISHED stage's verdict entry
  // in `playbookAdvance` above; this adds the entry for the stage now
  // active (or the terminal stage's completion stamp).
  const stamped = recordHistory(key, { stage: nextStage ? nextStage.name : finishedStage, at }, opts)
  return { ...stamped, events }
}
