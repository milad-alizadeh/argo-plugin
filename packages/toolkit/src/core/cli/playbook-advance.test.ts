import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerGate, type Gate, type GateVerdict } from '../gate.js'
import { definePlaybook, registerPlaybook } from '../spec.js'
import { readInstance, writeInstance, type PlaybookInstance } from '../state.js'
import { playbookAdvance } from './playbook-advance.js'

const currentDir = dirname(fileURLToPath(import.meta.url))

/** Runs a real child process racing `playbookAdvance` against a shared instance:
 * synchronous fs calls never yield in-process, so only two OS processes can
 * exercise the lost-update window. Resolves on exit 0. */
function spawnAdvanceWorker(key: string, playbookName: string, gateName: string, stateRoot: string, cwd: string): Promise<void> {
  const workerPath = join(currentDir, '..', 'fixtures', 'playbook-advance-worker.mjs')
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [workerPath, key, playbookName, gateName, stateRoot, cwd], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`worker exited ${code}`))))
  })
}

function makeGate(name: string, verdict: GateVerdict): Gate {
  return { name, async check() { return verdict } }
}

function makeInstance(overrides: Partial<PlaybookInstance> = {}): PlaybookInstance {
  return {
    playbook: 'placeholder',
    target: 'fixture',
    stage: 'build',
    status: 'in-progress',
    attempts: [],
    history: [],
    ...overrides
  }
}

describe('playbookAdvance', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-playbook-advance-state-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-playbook-advance-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('advances to the next stage on a passing verdict', async () => {
    const gateName = `advance-pass-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const playbookName = `advance-pass-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name: playbookName,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: gateName },
          { name: 'build', allows: ['file-edit'], gate: 'unused-gate' }
        ]
      })
    )
    writeInstance('advance-pass', makeInstance({ playbook: playbookName, stage: 'brief' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-pass', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('in-progress')
    // One entry for the finished stage's verdict, one transition stamp for
    // the newly-entered stage.
    expect(result.history).toHaveLength(2)
    expect(result.history[0]).toMatchObject({ stage: 'brief', gate: gateName, verdict: { passed: true } })
    expect(result.history[1]).toMatchObject({ stage: 'build' })
    expect(result.history[1].gate).toBeUndefined()
  })

  it('marks the instance done when the last stage passes', async () => {
    const gateName = `advance-done-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const playbookName = `advance-done-playbook-${Math.random()}`
    registerPlaybook(definePlaybook({ name: playbookName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName }] }))
    writeInstance('advance-done', makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-done', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('done')
    expect(result.history).toHaveLength(2)
    expect(result.history[1]).toMatchObject({ stage: 'build' })
  })

  it('increments attempts and stays in-progress on a failure within budget', async () => {
    const gateName = `advance-fail-budget-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [{ message: 'off' }], evidence: [] }))
    const playbookName = `advance-fail-budget-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({ name: playbookName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName, retries: 2 }] })
    )
    writeInstance('advance-fail-budget', makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-fail-budget', { cwd, stateRoot, whatWasTried: 'first pass' })

    expect(result.stage).toBe('build')
    expect(result.status).toBe('in-progress')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]).toMatchObject({ round: 1, gate: gateName, whatWasTried: 'first pass' })
  })

  it('sets status stuck once the retry budget is exhausted', async () => {
    const gateName = `advance-fail-stuck-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [], evidence: [] }))
    const playbookName = `advance-fail-stuck-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({ name: playbookName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName, retries: 2 }] })
    )
    writeInstance('advance-fail-stuck', makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    await playbookAdvance('advance-fail-stuck', { cwd, stateRoot })
    const result = await playbookAdvance('advance-fail-stuck', { cwd, stateRoot })

    expect(result.status).toBe('stuck')
    expect(result.stage).toBe('build')
    expect(result.attempts).toHaveLength(2)
    expect(readInstance('advance-fail-stuck', { cwd, stateRoot })?.status).toBe('stuck')
  })

  it('goes stuck on the first failure when the stage declares no retries', async () => {
    const gateName = `advance-fail-no-retries-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: false, findings: [], evidence: [] }))
    const playbookName = `advance-fail-no-retries-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({ name: playbookName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName }] })
    )
    writeInstance('advance-fail-no-retries', makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-fail-no-retries', { cwd, stateRoot })

    expect(result.status).toBe('stuck')
    expect(result.attempts).toHaveLength(1)
  })

  it('advances immediately when the stage declares no gate', async () => {
    const playbookName = `advance-no-gate-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name: playbookName,
        stages: [
          { name: 'brief', allows: ['file-edit'] },
          { name: 'build', allows: ['file-edit'] }
        ]
      })
    )
    writeInstance('advance-no-gate', makeInstance({ playbook: playbookName, stage: 'brief' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-no-gate', { cwd, stateRoot })

    expect(result.stage).toBe('build')
    // Gateless stages record no verdict, but the transition itself is still
    // stamped.
    expect(result.history).toHaveLength(1)
    expect(result.history[0]).toMatchObject({ stage: 'build' })
    expect(result.history[0].gate).toBeUndefined()
    expect(result.history[0].verdict).toBeUndefined()
  })

  it('rejects a caller-supplied --artifacts path that is not derivable from the stage\'s produces (doctored artifact)', async () => {
    const gateName = `advance-doctored-gate-${Math.random()}`
    registerGate(makeGate(gateName, { passed: true, findings: [], evidence: [] }))
    const playbookName = `advance-doctored-artifacts-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name: playbookName,
        stages: [{ name: 'brief', allows: ['file-edit'], gate: gateName, produces: ['brief:brief.md'] }]
      })
    )
    writeInstance('advance-doctored-artifacts', makeInstance({ playbook: playbookName, stage: 'brief' }), { cwd, stateRoot })

    // A doctored file elsewhere on disk the caller wants the gate to read
    // instead of the produces-derived path.
    await expect(
      playbookAdvance('advance-doctored-artifacts', {
        cwd,
        stateRoot,
        settings: { cwd },
        artifacts: { brief: join(cwd, 'doctored.md') }
      })
    ).rejects.toThrow(/produces/)
  })

  it("auto-derives artifacts from the stage spec's `produces` entries when none are passed", async () => {
    const { createBriefCheckGate } = await import('../../packs/design/gates/brief-check.js')
    const { writeFileSync } = await import('node:fs')

    const briefContent = '# Purpose\n\nx\n\n# Sections\n\nx\n\n# Acceptance Criteria\n\nx\n'
    writeFileSync(join(cwd, 'brief.md'), briefContent)

    registerGate(createBriefCheckGate({ cwd, artifactKey: 'brief' }))
    const playbookName = `advance-auto-artifacts-playbook-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name: playbookName,
        stages: [{ name: 'brief', allows: ['file-edit'], gate: 'brief-check', produces: ['brief:brief.md'] }]
      })
    )
    writeInstance('advance-auto-artifacts', makeInstance({ playbook: playbookName, stage: 'brief' }), { cwd, stateRoot })

    const result = await playbookAdvance('advance-auto-artifacts', { cwd, stateRoot, settings: { cwd } })

    expect(result.status).toBe('done')
    expect(result.history[0]).toMatchObject({ stage: 'brief', gate: 'brief-check', verdict: { passed: true } })
  })

  it("threads GateContext.judge through to the stage's gate", async () => {
    const gateName = `advance-ctx-judge-gate-${Math.random()}`
    let receivedCtx: unknown
    registerGate({
      name: gateName,
      async check(_input, ctx) {
        receivedCtx = ctx
        return { passed: true, findings: [], evidence: [] }
      }
    })
    const playbookName = `advance-ctx-judge-playbook-${Math.random()}`
    registerPlaybook(definePlaybook({ name: playbookName, stages: [{ name: 'build', allows: ['file-edit'], gate: gateName }] }))
    writeInstance('advance-ctx-judge', makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    const judge = async () => ({ passed: true, findings: [], evidence: [] })
    await playbookAdvance('advance-ctx-judge', { cwd, stateRoot, ctx: { judge } })

    expect(receivedCtx).toEqual({ judge })
  })

  it('two interleaved advances from separate processes both land their attempt — no lost stage/status update', async () => {
    const key = `advance-race-${Math.random()}`
    const playbookName = `advance-race-playbook-${Math.random()}`
    const gateName = `advance-race-gate-${Math.random()}`
    writeInstance(key, makeInstance({ playbook: playbookName, stage: 'build' }), { cwd, stateRoot })

    await Promise.all([
      spawnAdvanceWorker(key, playbookName, gateName, stateRoot, cwd),
      spawnAdvanceWorker(key, playbookName, gateName, stateRoot, cwd)
    ])

    const result = readInstance(key, { cwd, stateRoot })
    // A bare read+write would let one process's status transition silently
    // clobber the other's — both concurrent failures must land as two
    // distinct attempts, with status reflecting the guarded outcome.
    expect(result?.attempts).toHaveLength(2)
    expect(result?.status).toBe('in-progress')
  })
})
