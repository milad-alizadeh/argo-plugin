import { getGate, type GateContext } from '../gate.js'
import { getPlaybook } from '../spec.js'
import {
  deriveInstanceKey,
  setActiveInstance,
  writeInstance,
  type HistoryEntry,
  type StateOptions,
  type PlaybookInstance
} from '../state.js'
import { GateNotFoundError, PlaybookNotFoundError } from './errors.js'

export interface PlaybookAdoptInput {
  name: string
  target: string
  key?: string
}

export interface PlaybookAdoptOptions extends StateOptions {
  artifacts?: Record<string, string>
  settings?: Record<string, unknown>
  /** Threaded into `Gate.check` as its `GateContext` argument, so AI-judging gates can reach `ctx.judge(...)` during re-verification. */
  ctx?: GateContext
  /** Session affinity for the active-instance pointer this adopt call sets. */
  sessionId?: string | null
}

/**
 * Self-heals an instance after a crash or manual work by walking stages in
 * order and RE-RUNNING each stage's gate against discovered artifacts, never
 * trusting a `produces` artifact's mere presence. Sets the current stage to
 * the highest CONTIGUOUSLY-passing one. A gate whose verdict signals
 * `rerunnable === false` cannot be safely re-checked out-of-band; adopt stops
 * at that stage and records `verified: false` instead of advancing past it,
 * regardless of that verdict's `passed` value.
 *
 * Rebuilds the instance from scratch: `attempts` resets to `[]` and
 * `history` is the fresh trail of this walk's re-runs, not a merge with any
 * prior instance's history.
 */
export async function playbookAdopt(input: PlaybookAdoptInput, opts: PlaybookAdoptOptions = {}): Promise<PlaybookInstance> {
  const spec = getPlaybook(input.name)
  if (!spec) throw new PlaybookNotFoundError(input.name)

  const key = input.key ?? deriveInstanceKey(input.name, input.target)
  const history: HistoryEntry[] = []
  let stage = spec.stages[0].name
  let status = 'in-progress'

  for (let i = 0; i < spec.stages.length; i++) {
    const stageSpec = spec.stages[i]
    const next = spec.stages[i + 1]

    if (!stageSpec.gate) {
      stage = next ? next.name : stageSpec.name
      status = next ? 'in-progress' : 'done'
      continue
    }

    const gate = getGate(stageSpec.gate)
    if (!gate) throw new GateNotFoundError(stageSpec.gate)

    const verdict = await gate.check(
      {
        target: input.target,
        artifacts: opts.artifacts ?? {},
        settings: opts.settings ?? {}
      },
      opts.ctx
    )

    if (verdict.rerunnable === false) {
      history.push({ stage: stageSpec.name, gate: stageSpec.gate, at: new Date().toISOString(), verdict, verified: false })
      stage = stageSpec.name
      status = 'in-progress'
      break
    }

    history.push({ stage: stageSpec.name, gate: stageSpec.gate, at: new Date().toISOString(), verdict, verified: true })

    if (!verdict.passed) {
      stage = stageSpec.name
      status = 'in-progress'
      break
    }

    stage = next ? next.name : stageSpec.name
    status = next ? 'in-progress' : 'done'
  }

  const instance: PlaybookInstance = {
    playbook: input.name,
    target: input.target,
    stage,
    status,
    attempts: [],
    history
  }
  writeInstance(key, instance, opts)
  // Without this, a crash-recovered instance is invisible to the permission
  // hook's active-instance lookup, defeating adopt as a recovery path.
  setActiveInstance(key, opts)
  return instance
}
