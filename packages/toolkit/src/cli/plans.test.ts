import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveProjectId, writeInstance } from '../core/state.js'
import { assertPlanQueued, listPlans, parsePlanFrontmatter } from './plans.js'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function writePlan(host: string, name: string, frontmatter: string | null, body = '# plan\n'): string {
  const dir = join(host, '.argo', 'plans')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, frontmatter === null ? body : `---\n${frontmatter}\n---\n\n${body}`)
  return path
}

describe('parsePlanFrontmatter', () => {
  it('reads draft/queued and updated', () => {
    expect(parsePlanFrontmatter('---\nstatus: queued\nupdated: 2026-07-09\n---\n# x')).toEqual({
      status: 'queued',
      updated: '2026-07-09'
    })
    expect(parsePlanFrontmatter('---\nstatus: draft\n---\n').status).toBe('draft')
  })

  it('anything outside the draft|queued enum (incl. a smuggled "landed") reads as null', () => {
    expect(parsePlanFrontmatter('---\nstatus: landed\n---\n').status).toBeNull()
    expect(parsePlanFrontmatter('---\nstatus: building\n---\n').status).toBeNull()
    expect(parsePlanFrontmatter('no frontmatter at all').status).toBeNull()
  })
})

describe('assertPlanQueued (the build-plan gate)', () => {
  let host: string
  beforeEach(() => {
    host = mkdtempSync(join(tmpdir(), 'argo-plans-gate-'))
  })
  afterEach(() => rmSync(host, { recursive: true, force: true }))

  it('refuses a draft plan', () => {
    const path = writePlan(host, 'draft.md', 'status: draft\nupdated: 2026-07-09')
    expect(() => assertPlanQueued(path)).toThrow(/status "draft"/)
  })

  it('refuses a plan with missing or invalid frontmatter', () => {
    expect(() => assertPlanQueued(writePlan(host, 'bare.md', null))).toThrow(/missing\/invalid/)
    expect(() => assertPlanQueued(join(host, 'nope.md'))).toThrow(/no plan file/)
  })

  it('passes a queued plan', () => {
    const path = writePlan(host, 'ready.md', 'status: queued\nupdated: 2026-07-09')
    expect(() => assertPlanQueued(path)).not.toThrow()
  })
})

describe('listPlans — frontmatter + derived landed + live-run overlay', () => {
  let host: string
  let stateRoot: string

  beforeEach(() => {
    host = mkdtempSync(join(tmpdir(), 'argo-plans-list-'))
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-plans-state-'))
    git(host, ['init', '-q', '-b', 'main'])
    git(host, ['config', 'user.email', 'test@example.com'])
    git(host, ['config', 'user.name', 'Test'])
  })

  afterEach(() => {
    rmSync(host, { recursive: true, force: true })
    rmSync(stateRoot, { recursive: true, force: true })
  })

  it('empty when .argo/plans/ does not exist', () => {
    expect(listPlans({ hostRoot: host, stateRoot })).toEqual([])
  })

  it('lists draft/queued from frontmatter, invalid when missing', () => {
    writePlan(host, 'a-draft.md', 'status: draft\nupdated: 2026-07-01')
    writePlan(host, 'b-queued.md', 'status: queued\nupdated: 2026-07-02')
    writePlan(host, 'c-bare.md', null)

    const entries = listPlans({ hostRoot: host, stateRoot })
    expect(entries.map((e) => [e.plan, e.status])).toEqual([
      ['a-draft.md', 'draft'],
      ['b-queued.md', 'queued'],
      ['c-bare.md', 'invalid']
    ])
    expect(entries[1].updated).toBe('2026-07-02')
  })

  it('derives landed from git for a merged plan; an uncommitted plan is not landed', () => {
    writePlan(host, 'merged.md', 'status: queued\nupdated: 2026-07-01')
    git(host, ['add', '.'])
    git(host, ['commit', '-q', '-m', 'land plan'])
    writePlan(host, 'floating.md', 'status: queued\nupdated: 2026-07-02')

    const byName = Object.fromEntries(listPlans({ hostRoot: host, stateRoot }).map((e) => [e.plan, e.status]))
    expect(byName['merged.md']).toBe('landed')
    expect(byName['floating.md']).toBe('queued')
  })

  it('a landed plan re-edited locally stops reading as landed', () => {
    const path = writePlan(host, 'merged.md', 'status: queued\nupdated: 2026-07-01')
    git(host, ['add', '.'])
    git(host, ['commit', '-q', '-m', 'land plan'])
    writeFileSync(path, '---\nstatus: draft\nupdated: 2026-07-09\n---\n# rework\n')

    expect(listPlans({ hostRoot: host, stateRoot })[0].status).toBe('draft')
  })

  it('overlays an in-flight run joined by target === plan basename, suppressing landed', () => {
    writePlan(host, 'building.md', 'status: queued\nupdated: 2026-07-01')
    git(host, ['add', '.'])
    git(host, ['commit', '-q', '-m', 'land plan'])

    writeInstance(
      'build-plan--building-md',
      { playbook: 'build-plan', target: 'building.md', stage: 'slice-2', status: 'in-progress', attempts: [], history: [] },
      { cwd: host, stateRoot }
    )
    // a finished run does NOT overlay
    writeInstance(
      'build-plan--done-md',
      { playbook: 'build-plan', target: 'done.md', stage: 'done', status: 'done', attempts: [], history: [] },
      { cwd: host, stateRoot }
    )

    const [entry] = listPlans({ hostRoot: host, stateRoot })
    expect(entry.plan).toBe('building.md')
    expect(entry.status).toBe('queued') // live state never lands the plan
    expect(entry.run).toEqual({
      key: 'build-plan--building-md',
      playbook: 'build-plan',
      stage: 'slice-2',
      status: 'in-progress'
    })
    // sanity: the store really is the project's home store
    expect(resolveProjectId(host)).toBeTruthy()
  })
})
