import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerGate, type Gate, type GateVerdict } from '../gate.js'
import { defineWorkflow, registerWorkflow } from '../spec.js'
import { readInstance, writeInstance, type WorkflowInstance } from '../state.js'
import { workflowAdvance } from './workflow-advance.js'

function makeGate(name: string, verdict: GateVerdict): Gate {
  return { name, async check() { return verdict } }
}

function makeInstance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    workflow: 'placeholder',
    target: 'fixture',
    stage: 'build',
    status: 'in-progress',
    attempts: [],
    history: [],
    ...overrides
  }
}

describe('workflowAdvance', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-workflow-advance-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-workflow-advance-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('advances to the next stage on a passing verdict', async () => {
    const gateName = `advance-pass-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const workflowName = `advance-pass-workflow-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name: workflowName,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: gateName },
          { name: 'build', allows: ['file-edit'], gate: 'unused-gate' }
        ]
      })
    )
    writeInstance('advance-pass', makeInstance({ workflow: workflowName, stage: 'brief' }), { cwd, stateRoot })

    const result = await workflowAdvance('advance-pass', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('in-progress')
    expect(result.history).toHaveLength(1)
    expect(result.history[0]).toMatchObject({ stage: 'brief', gate: gateName, verdict: { passed: true } })
  })

  it('marks the instance done when the last stage passes', async () => {
    const gateName = `advance-done-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const workflowName = `advance-done-workflow-${Math.random()}`
    registerWorkflow(defineWorkflow({ name: workflowName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName }] }))
    writeInstance('advance-done', makeInstance({ workflow: workflowName, stage: 'build' }), { cwd, stateRoot })

    const result = await workflowAdvance('advance-done', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('done')
  })

  it('increments attempts and stays in-progress on a failure within budget', async () => {
    const gateName = `advance-fail-budget-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [{ message: 'off' }], evidence: [] }))
    const workflowName = `advance-fail-budget-workflow-${Math.random()}`
    registerWorkflow(
      defineWorkflow({ name: workflowName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName, retries: 2 }] })
    )
    writeInstance('advance-fail-budget', makeInstance({ workflow: workflowName, stage: 'build' }), { cwd, stateRoot })

    const result = await workflowAdvance('advance-fail-budget', { cwd, stateRoot, whatWasTried: 'first pass' })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('in-progress')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]).toMatchObject({ round: 1, gate: gateName, whatWasTried: 'first pass' })
  })

  it('sets status stuck once the retry budget is exhausted', async () => {
    const gateName = `advance-fail-stuck-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [], evidence: [] }))
    const workflowName = `advance-fail-stuck-workflow-${Math.random()}`
    registerWorkflow(
      defineWorkflow({ name: workflowName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName, retries: 2 }] })
    )
    writeInstance('advance-fail-stuck', makeInstance({ workflow: workflowName, stage: 'build' }), { cwd, stateRoot })

    await workflowAdvance('advance-fail-stuck', { cwd, stateRoot })
    const result = await workflowAdvance('advance-fail-stuck', { cwd, stateRoot })

    expect(result.status).toBe('stuck')
    expect(result.stage).toBe('build')
    expect(result.attempts).toHaveLength(2)
    expect(readInstance('advance-fail-stuck', { cwd, stateRoot })?.status).toBe('stuck')
  })

  it('goes stuck on the first failure when the stage declares no retries', async () => {
    const gateName = `advance-fail-no-retries-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [], evidence: [] }))
    const workflowName = `advance-fail-no-retries-workflow-${Math.random()}`
    registerWorkflow(
      defineWorkflow({ name: workflowName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName }] })
    )
    writeInstance('advance-fail-no-retries', makeInstance({ workflow: workflowName, stage: 'build' }), { cwd, stateRoot })

    const result = await workflowAdvance('advance-fail-no-retries', { cwd, stateRoot })

    expect(result.status).toBe('stuck')
    expect(result.attempts).toHaveLength(1)
  })

  it('advances immediately when the stage declares no gate', async () => {
    const workflowName = `advance-no-gate-workflow-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name: workflowName,
        stages: [
          { name: 'brief', allows: ['file-edit'] },
          { name: 'build', allows: ['file-edit'] }
        ]
      })
    )
    writeInstance('advance-no-gate', makeInstance({ workflow: workflowName, stage: 'brief' }), { cwd, stateRoot })

    const result = await workflowAdvance('advance-no-gate', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    expect(result.history).toHaveLength(0)
  })
})
