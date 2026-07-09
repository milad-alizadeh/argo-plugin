import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { definePlaybook, registerPlaybook } from '../spec.js'
import { getActiveInstance, readInstance } from '../state.js'
import { PlaybookNotFoundError } from './errors.js'
import { playbookStart } from './playbook-start.js'

describe('playbookStart', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-playbook-start-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-playbook-start-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('throws PlaybookNotFoundError for an unknown playbook name', () => {
    expect(() => playbookStart({ name: `no-such-playbook-${Math.random()}`, target: 'fixture' }, { cwd, stateRoot })).toThrow(
      PlaybookNotFoundError
    )
  })

  it('writes the initial instance at stage 0 for a valid start', () => {
    const name = `start-fixture-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: 'brief-check' },
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check' }
        ]
      })
    )

    const { key, instance } = playbookStart({ name, target: 'fixture-screen' }, { cwd, stateRoot })

    expect(instance).toEqual({
      playbook: name,
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
    registerPlaybook(
      definePlaybook({
        name,
        stages: [{ name: 'brief', allows: ['file-edit'], gate: 'brief-check' }]
      })
    )

    const { instance } = playbookStart({ name, target: 'fixture-screen' }, { cwd, stateRoot })

    expect(getActiveInstance({ cwd, stateRoot })).toEqual(instance)
    expect(getActiveInstance({ cwd, stateRoot })?.playbook).toBe(name)
  })

  it('rejects a plan-doc target given as a PATH — the plan↔run join key is the basename', () => {
    const name = `join-key-fixture-${Math.random()}`
    registerPlaybook(
      definePlaybook({ name, stages: [{ name: 'build', allows: ['file-edit'], gate: 'x' }] })
    )

    expect(() => playbookStart({ name, target: '.argo/plans/my-plan.md' }, { cwd, stateRoot })).toThrow(/BASENAME/)
    expect(() => playbookStart({ name, target: 'my-plan.md' }, { cwd, stateRoot })).not.toThrow()
  })

  it('refuses to start when the terminal stage hands off to a disabled pack', () => {
    const name = `handoff-fixture-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name,
        stages: [
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', handsOffToPack: 'pack-code' }
        ]
      })
    )
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ packs: { 'pack-design': true } }))

    expect(() => playbookStart({ name, target: 'fixture' }, { cwd, stateRoot })).toThrow(/pack-code/)
  })

  it('starts when the terminal stage hands off to an enabled pack', () => {
    const name = `handoff-ok-fixture-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name,
        stages: [{ name: 'build', allows: ['file-edit'], gate: 'x', handsOffToPack: 'pack-code' }]
      })
    )
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ packs: { 'pack-code': true } }))

    expect(() => playbookStart({ name, target: 'fixture' }, { cwd, stateRoot })).not.toThrow()
  })
})
