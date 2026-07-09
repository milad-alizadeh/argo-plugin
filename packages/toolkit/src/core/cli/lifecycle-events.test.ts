import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PLAYBOOK_LIFECYCLE_EVENTS } from '../events.js'
import { registerGate, type Gate, type GateVerdict } from '../gate.js'
import { definePlaybook, registerPlaybook } from '../spec.js'
import { readInstance } from '../state.js'
import { playbookAdvance } from './playbook-advance.js'
import { playbookStart } from './playbook-start.js'

function makeGate(name: string, verdict: GateVerdict): Gate {
  return { name, async check() { return verdict } }
}

describe('playbook lifecycle event emission (host-app contract)', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-lifecycle-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-lifecycle-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  function registerTwoStage() {
    const gateName = `lifecycle-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const playbookName = `lifecycle-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name: playbookName,
        stages: [
          { name: 'draft', allows: ['file-edit'], gate: gateName },
          { name: 'verify', allows: ['file-read'], gate: gateName }
        ]
      })
    )
    return playbookName
  }

  it('start emits playbook_started + stage_started for the first stage', () => {
    const playbookName = registerTwoStage()
    const result = playbookStart({ name: playbookName, target: 'fixture' }, { cwd, stateRoot })

    expect(result.events).toEqual([
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.PLAYBOOK_STARTED, playbook: playbookName }),
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_STARTED, playbook: playbookName, stage: 'draft' })
    ])
    for (const e of result.events) expect(() => new Date(e.at).toISOString()).not.toThrow()
  })

  it('a passing advance emits stage_finished + next stage_started; the terminal pass emits playbook_finished', async () => {
    const playbookName = registerTwoStage()
    const { key } = playbookStart({ name: playbookName, target: 'fixture' }, { cwd, stateRoot })

    const mid = await playbookAdvance(key, { cwd, stateRoot })
    expect(mid.events).toEqual([
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_FINISHED, stage: 'draft' }),
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_STARTED, stage: 'verify' })
    ])

    const done = await playbookAdvance(key, { cwd, stateRoot })
    expect(done.status).toBe('done')
    expect(done.events).toEqual([
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.STAGE_FINISHED, stage: 'verify' }),
      expect.objectContaining({ event: PLAYBOOK_LIFECYCLE_EVENTS.PLAYBOOK_FINISHED, playbook: playbookName })
    ])
    // Events are call-scoped, never persisted into the state file.
    expect(readInstance(key, { cwd, stateRoot })).not.toHaveProperty('events')
  })

  it('a failing verdict emits no lifecycle events (retry/stuck rides status)', async () => {
    const gateName = `lifecycle-fail-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [{ message: 'nope' }], evidence: [] }))
    const playbookName = `lifecycle-fail-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({ name: playbookName, stages: [{ name: 'draft', allows: ['file-edit'], gate: gateName, retries: 2 }] })
    )
    const { key } = playbookStart({ name: playbookName, target: 'fixture' }, { cwd, stateRoot })

    const result = await playbookAdvance(key, { cwd, stateRoot })
    expect(result.status).toBe('in-progress')
    expect(result.events).toEqual([])
  })
})
