import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineWorkflow, registerWorkflow } from '../spec.js'
import { writeInstance, type WorkflowInstance } from '../state.js'
import { workflowStatus } from './workflow-status.js'

describe('workflowStatus', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-workflow-status-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-workflow-status-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('reports found: false for a missing instance', () => {
    expect(workflowStatus('never-started', { cwd, stateRoot })).toEqual({ found: false, key: 'never-started' })
  })

  it("reports a normal instance's current stage, not stuck", () => {
    const name = `status-normal-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: 'brief-check', retries: 2 },
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 }
        ]
      })
    )
    const instance: WorkflowInstance = {
      workflow: name,
      target: 'fixture',
      stage: 'build',
      status: 'in-progress',
      attempts: [{ round: 1, gate: 'brief-check', findings: [], whatWasTried: 'x' }],
      history: []
    }
    writeInstance('status-normal', instance, { cwd, stateRoot })

    const report = workflowStatus('status-normal', { cwd, stateRoot })
    expect(report).toMatchObject({ found: true, stage: 'build', status: 'in-progress', stuck: false, attemptsInStage: 0 })
  })

  it('reports stuck when attempts against the current stage gate reach its retry budget', () => {
    const name = `status-stuck-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [{ name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 }]
      })
    )
    const instance: WorkflowInstance = {
      workflow: name,
      target: 'fixture',
      stage: 'build',
      status: 'in-progress',
      attempts: [
        { round: 1, gate: 'design-rules-check', findings: [], whatWasTried: 'a' },
        { round: 2, gate: 'design-rules-check', findings: [], whatWasTried: 'b' }
      ],
      history: []
    }
    writeInstance('status-stuck', instance, { cwd, stateRoot })

    const report = workflowStatus('status-stuck', { cwd, stateRoot })
    expect(report).toMatchObject({ found: true, stuck: true, attemptsInStage: 2 })
  })

  it('reports stuck when the stored status already says so, regardless of budget', () => {
    const instance: WorkflowInstance = {
      workflow: 'unregistered-workflow',
      target: 'fixture',
      stage: 'build',
      status: 'stuck',
      attempts: [],
      history: []
    }
    writeInstance('status-stuck-flag', instance, { cwd, stateRoot })

    const report = workflowStatus('status-stuck-flag', { cwd, stateRoot })
    expect(report).toMatchObject({ found: true, stuck: true })
  })

  it("surfaces the last recorded verdict", () => {
    const instance: WorkflowInstance = {
      workflow: 'unregistered-workflow-2',
      target: 'fixture',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: [
        { stage: 'brief', gate: 'brief-check', at: '2026-07-09T00:00:00.000Z', verdict: { passed: true, findings: [], evidence: [] } },
        { stage: 'build', gate: 'design-rules-check', at: '2026-07-09T01:00:00.000Z', verdict: { passed: false, findings: [{ message: 'off' }], evidence: [] } }
      ]
    }
    writeInstance('status-last-verdict', instance, { cwd, stateRoot })

    const report = workflowStatus('status-last-verdict', { cwd, stateRoot })
    expect(report).toMatchObject({
      found: true,
      lastVerdict: { passed: false, findings: [{ message: 'off' }], evidence: [] }
    })
  })
})
