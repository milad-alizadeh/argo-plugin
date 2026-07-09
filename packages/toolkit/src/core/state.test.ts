import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveInstance,
  getActiveInstanceKey,
  readInstance,
  recordAttempt,
  recordHistory,
  resolveProjectId,
  setActiveInstance,
  writeInstance,
  type PlaybookInstance
} from './state.js'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function makeInstance(overrides: Partial<PlaybookInstance> = {}): PlaybookInstance {
  return {
    playbook: 'screen-create',
    target: 'fixture-screen',
    stage: 'brief',
    status: 'in-progress',
    attempts: [],
    history: [],
    ...overrides
  }
}

describe('resolveProjectId', () => {
  let repoDir: string
  let worktreeDir: string

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'argo-state-repo-'))
    git(repoDir, ['init', '-q'])
    git(repoDir, ['config', 'user.email', 'test@example.com'])
    git(repoDir, ['config', 'user.name', 'Test'])
    git(repoDir, ['commit', '--allow-empty', '-q', '-m', 'init'])

    worktreeDir = mkdtempSync(join(tmpdir(), 'argo-state-worktree-'))
    rmSync(worktreeDir, { recursive: true, force: true }) // git worktree add requires the path not exist
    git(repoDir, ['worktree', 'add', '-q', worktreeDir, '-b', 'wt-branch'])
  })

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true })
    rmSync(worktreeDir, { recursive: true, force: true })
  })

  it('resolves two worktrees of the same repo to the same project-id', () => {
    expect(resolveProjectId(worktreeDir)).toBe(resolveProjectId(repoDir))
  })

  it('resolves two unrelated repos to different project-ids', () => {
    const other = mkdtempSync(join(tmpdir(), 'argo-state-other-'))
    git(other, ['init', '-q'])
    try {
      expect(resolveProjectId(other)).not.toBe(resolveProjectId(repoDir))
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})

describe('readInstance / writeInstance', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-state-root-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-state-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('round-trips a written instance', () => {
    const instance = makeInstance()
    writeInstance('screen-create-fixture', instance, { stateRoot, cwd })

    expect(readInstance('screen-create-fixture', { stateRoot, cwd })).toEqual(instance)
  })

  it('reads a missing instance as null', () => {
    expect(readInstance('never-written', { stateRoot, cwd })).toBeNull()
  })
})

describe('recordAttempt / recordHistory', () => {
  let stateRoot: string
  let cwd: string
  const key = 'append-only-fixture'

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-state-root-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-state-cwd-'))
    writeInstance(key, makeInstance(), { stateRoot, cwd })
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('recording twice yields two attempts in order', () => {
    recordAttempt(key, { round: 1, gate: 'design-rules-check', findings: [], whatWasTried: 'first pass' }, { stateRoot, cwd })
    const result = recordAttempt(
      key,
      { round: 2, gate: 'design-rules-check', findings: [{ message: 'still off' }], whatWasTried: 'second pass' },
      { stateRoot, cwd }
    )

    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toEqual({ round: 1, gate: 'design-rules-check', findings: [], whatWasTried: 'first pass' })
    expect(result.attempts[1]).toEqual({
      round: 2,
      gate: 'design-rules-check',
      findings: [{ message: 'still off' }],
      whatWasTried: 'second pass'
    })
  })

  it('recording twice yields two history entries in order', () => {
    recordHistory(key, { stage: 'brief', gate: 'brief-check', at: '2026-07-09T00:00:00.000Z', verdict: { passed: true, findings: [], evidence: [] } }, { stateRoot, cwd })
    const result = recordHistory(
      key,
      { stage: 'build', gate: 'design-rules-check', at: '2026-07-09T01:00:00.000Z', verdict: { passed: false, findings: [], evidence: [] } },
      { stateRoot, cwd }
    )

    expect(result.history).toHaveLength(2)
    expect(result.history[0].stage).toBe('brief')
    expect(result.history[1].stage).toBe('build')
  })

  it('throws when recording against a key with no instance yet', () => {
    expect(() => recordAttempt('no-such-key', { round: 1, gate: 'x', findings: [], whatWasTried: 'x' }, { stateRoot, cwd })).toThrow(
      /no instance/
    )
  })
})

describe('setActiveInstance / getActiveInstance', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-state-root-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-state-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  it('no pointer written yet → getActiveInstanceKey/getActiveInstance both null', () => {
    expect(getActiveInstanceKey({ stateRoot, cwd })).toBeNull()
    expect(getActiveInstance({ stateRoot, cwd })).toBeNull()
  })

  it('setActiveInstance then getActiveInstance resolves the pointed-at instance', () => {
    const instance = makeInstance()
    writeInstance('active-fixture', instance, { stateRoot, cwd })
    setActiveInstance('active-fixture', { stateRoot, cwd })

    expect(getActiveInstanceKey({ stateRoot, cwd })).toBe('active-fixture')
    expect(getActiveInstance({ stateRoot, cwd })).toEqual(instance)
  })

  it('pointer present but pointed-at instance missing → getActiveInstance is null', () => {
    setActiveInstance('never-written', { stateRoot, cwd })
    expect(getActiveInstance({ stateRoot, cwd })).toBeNull()
  })
})

describe('durability: atomic writes, advisory lock', () => {
  let stateRoot: string
  let cwd: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-state-root-'))
    cwd = mkdtempSync(join(tmpdir(), 'argo-state-cwd-'))
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  const listAll = (dir: string): string[] => readdirSync(dir, { recursive: true }) as string[]

  it('writeInstance / setActiveInstance leave no temp or lock files behind', () => {
    writeInstance('atomic-fixture', makeInstance(), { stateRoot, cwd })
    setActiveInstance('atomic-fixture', { stateRoot, cwd })
    recordAttempt('atomic-fixture', { round: 1, gate: 'g', findings: [], whatWasTried: 'x' }, { stateRoot, cwd })

    const leftovers = listAll(stateRoot).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock'))
    expect(leftovers).toEqual([])
    expect(readInstance('atomic-fixture', { stateRoot, cwd })!.attempts).toHaveLength(1)
  })

  it('a stale advisory lock (crashed holder) does not wedge recordAttempt', () => {
    writeInstance('locked-fixture', makeInstance(), { stateRoot, cwd })
    // simulate a crashed writer: plant a lock file, backdate it past staleness
    const projectDirs = readdirSync(stateRoot)
    const lockPath = join(stateRoot, projectDirs[0], 'playbooks', 'locked-fixture.json.lock')
    execFileSync('sh', ['-c', `touch -t 202001010000 "${lockPath}"`])

    const result = recordAttempt('locked-fixture', { round: 1, gate: 'g', findings: [], whatWasTried: 'x' }, { stateRoot, cwd })
    expect(result.attempts).toHaveLength(1)
  })
})

describe('active pointer worktree affinity', () => {
  let repoDir: string
  let worktreeDir: string
  let stateRoot: string

  beforeEach(() => {
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-state-root-'))
    repoDir = mkdtempSync(join(tmpdir(), 'argo-state-repo-'))
    git(repoDir, ['init', '-q'])
    git(repoDir, ['config', 'user.email', 'test@example.com'])
    git(repoDir, ['config', 'user.name', 'Test'])
    git(repoDir, ['commit', '--allow-empty', '-q', '-m', 'init'])
    worktreeDir = mkdtempSync(join(tmpdir(), 'argo-state-worktree-'))
    rmSync(worktreeDir, { recursive: true, force: true })
    git(repoDir, ['worktree', 'add', '-q', worktreeDir, '-b', 'wt-branch'])
  })

  afterEach(() => {
    rmSync(stateRoot, { recursive: true, force: true })
    rmSync(repoDir, { recursive: true, force: true })
    rmSync(worktreeDir, { recursive: true, force: true })
  })

  it('two worktrees of one repo share the instance store but keep DISTINCT active pointers', () => {
    // same project-id → instances written from either worktree are shared
    writeInstance('run-main', makeInstance({ target: 'main-run' }), { stateRoot, cwd: repoDir })
    writeInstance('run-wt', makeInstance({ target: 'wt-run' }), { stateRoot, cwd: worktreeDir })
    expect(readInstance('run-wt', { stateRoot, cwd: repoDir })).not.toBeNull()

    // concurrent gated builds: each worktree points at ITS OWN run
    setActiveInstance('run-main', { stateRoot, cwd: repoDir })
    setActiveInstance('run-wt', { stateRoot, cwd: worktreeDir })

    expect(getActiveInstanceKey({ stateRoot, cwd: repoDir })).toBe('run-main')
    expect(getActiveInstanceKey({ stateRoot, cwd: worktreeDir })).toBe('run-wt')
    expect(getActiveInstance({ stateRoot, cwd: worktreeDir })!.target).toBe('wt-run')
  })

  it('a subdirectory of a worktree resolves to that worktree\'s pointer', () => {
    setActiveInstance('run-wt', { stateRoot, cwd: worktreeDir })
    const nested = join(worktreeDir, 'src')
    execFileSync('mkdir', ['-p', nested])
    expect(getActiveInstanceKey({ stateRoot, cwd: nested })).toBe('run-wt')
  })
})
