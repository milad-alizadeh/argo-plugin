import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerGate, type Gate, type GateVerdict } from '../gate.js'
import { defineWorkflow, registerWorkflow } from '../spec.js'
import { deriveInstanceKey, readInstance } from '../state.js'
import { workflowAdopt } from './workflow-adopt.js'

function makeGate(name: string, verdict: GateVerdict): Gate {
  return { name, async check() { return verdict } }
}

describe('workflowAdopt', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-workflow-adopt-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-workflow-adopt-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('does not advance past a stage whose re-run gate fails, even with a fabricated artifact present', async () => {
    const briefGate = `adopt-brief-gate-${Math.random()}`
    const buildGate = `adopt-build-gate-${Math.random()}`
    registerGate(makeGate(briefGate, { passed: true, findings: [], evidence: [] }))
    // Simulates a fabricated/copied manifest.json at the `produces` path: an
    // artifact URI is supplied, but the gate re-reads live truth and fails.
    registerGate(makeGate(buildGate, { passed: false, findings: [{ message: 'manifest does not match live Figma' }], evidence: [] }))
    const workflowName = `adopt-fabricated-artifact-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name: workflowName,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: briefGate },
          { name: 'build', allows: ['file-edit'], gate: buildGate }
        ]
      })
    )

    const instance = await workflowAdopt(
      { name: workflowName, target: 'fixture-screen' },
      { cwd, stateRoot, artifacts: { manifest: 'file:///fixture/manifests/fixture-screen.json' } }
    )

    expect(instance.stage).toBe('build')
    expect(instance.status).toBe('in-progress')
    expect(instance.history).toHaveLength(2)
    expect(instance.history[1]).toMatchObject({ stage: 'build', gate: buildGate, verdict: { passed: false } })
  })

  it('records verified: false and stops at a gate that signals it cannot be safely re-run', async () => {
    const buildGate = `adopt-unrerunnable-gate-${Math.random()}`
    const reviewGate = `adopt-unreached-gate-${Math.random()}`
    registerGate(makeGate(buildGate, { passed: true, findings: [], evidence: [], rerunnable: false }))
    registerGate(makeGate(reviewGate, { passed: true, findings: [], evidence: [] }))
    const workflowName = `adopt-unrerunnable-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name: workflowName,
        stages: [
          { name: 'build', allows: ['file-edit'], gate: buildGate },
          { name: 'review', allows: ['file-edit'], gate: reviewGate }
        ]
      })
    )

    const instance = await workflowAdopt({ name: workflowName, target: 'fixture-screen' }, { cwd, stateRoot })

    expect(instance.stage).toBe('build')
    expect(instance.status).toBe('in-progress')
    expect(instance.history).toHaveLength(1)
    expect(instance.history[0]).toMatchObject({ stage: 'build', gate: buildGate, verified: false })
  })

  it('advances through every contiguously-passing stage to done', async () => {
    const briefGate = `adopt-happy-brief-${Math.random()}`
    const buildGate = `adopt-happy-build-${Math.random()}`
    registerGate(makeGate(briefGate, { passed: true, findings: [], evidence: [] }))
    registerGate(makeGate(buildGate, { passed: true, findings: [], evidence: [] }))
    const workflowName = `adopt-happy-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name: workflowName,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: briefGate },
          { name: 'build', allows: ['file-edit'], gate: buildGate }
        ]
      })
    )

    const instance = await workflowAdopt({ name: workflowName, target: 'fixture-screen' }, { cwd, stateRoot })
    const key = deriveInstanceKey(workflowName, 'fixture-screen')

    expect(instance.stage).toBe('build')
    expect(instance.status).toBe('done')
    expect(readInstance(key, { cwd, stateRoot })).toEqual(instance)
  })
})
