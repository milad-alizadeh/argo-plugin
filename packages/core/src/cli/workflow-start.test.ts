import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineWorkflow, registerWorkflow } from '../spec.js'
import { getActiveInstance, readInstance } from '../state.js'
import { WorkflowNotFoundError } from './errors.js'
import { workflowStart } from './workflow-start.js'

describe('workflowStart', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-workflow-start-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-workflow-start-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('throws WorkflowNotFoundError for an unknown workflow name', () => {
    expect(() => workflowStart({ name: `no-such-workflow-${Math.random()}`, target: 'fixture' }, { cwd, stateRoot })).toThrow(
      WorkflowNotFoundError
    )
  })

  it('writes the initial instance at stage 0 for a valid start', () => {
    const name = `start-fixture-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: 'brief-check' },
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check' }
        ]
      })
    )

    const { key, instance } = workflowStart({ name, target: 'fixture-screen' }, { cwd, stateRoot })

    expect(instance).toEqual({
      workflow: name,
      target: 'fixture-screen',
      stage: 'brief',
      status: 'in-progress',
      attempts: [],
      history: []
    })
    expect(readInstance(key, { cwd, stateRoot })).toEqual(instance)
  })

  it('marks the newly-started instance as the project active instance', () => {
    const name = `active-fixture-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [{ name: 'brief', allows: ['file-edit'], gate: 'brief-check' }]
      })
    )

    const { instance } = workflowStart({ name, target: 'fixture-screen' }, { cwd, stateRoot })

    expect(getActiveInstance({ cwd, stateRoot })).toEqual(instance)
    expect(getActiveInstance({ cwd, stateRoot })?.workflow).toBe(name)
  })

  it('refuses to start when the terminal stage hands off to a disabled pack', () => {
    const name = `handoff-fixture-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', handsOffToPack: 'pack-code' }
        ]
      })
    )
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ packs: { 'pack-design': true } }))

    expect(() => workflowStart({ name, target: 'fixture' }, { cwd, stateRoot })).toThrow(/pack-code/)
  })

  it('starts when the terminal stage hands off to an enabled pack', () => {
    const name = `handoff-ok-fixture-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [{ name: 'build', allows: ['file-edit'], gate: 'x', handsOffToPack: 'pack-code' }]
      })
    )
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ packs: { 'pack-code': true } }))

    expect(() => workflowStart({ name, target: 'fixture' }, { cwd, stateRoot })).not.toThrow()
  })
})
