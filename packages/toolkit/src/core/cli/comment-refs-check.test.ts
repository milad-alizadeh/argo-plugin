import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCommentRefsCheck } from './comment-refs-check.js'

describe('runCommentRefsCheck', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'argo-comment-refs-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves a reference to a file that exists on disk', () => {
    writeFileSync(join(root, 'real.ts'), 'export const x = 1\n')
    writeFileSync(join(root, 'SKILL.md'), 'See `real.ts` for the implementation.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['SKILL.md'] })

    expect(findings).toEqual([])
  })

  it('flags a reference to a file that does not exist', () => {
    writeFileSync(join(root, 'SKILL.md'), 'See `missing.ts` for the implementation.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['SKILL.md'] })

    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'unresolved-file-reference', token: 'missing.ts', file: 'SKILL.md' })
    )
  })

  it('resolves an `argo <verb>` reference against the known verb set', () => {
    writeFileSync(join(root, 'doc.md'), 'Run `argo status` to check drift.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['doc.md'], knownVerbs: ['status', 'init'] })

    expect(findings).toEqual([])
  })

  it('flags an `argo <verb>` reference to an unknown verb', () => {
    writeFileSync(join(root, 'doc.md'), 'Run `argo frobnicate` first.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['doc.md'], knownVerbs: ['status', 'init'] })

    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'unresolved-verb', token: 'frobnicate', file: 'doc.md' })
    )
  })

  it('does not flag a verb reference when no known-verb set is provided (advisory scope only)', () => {
    writeFileSync(join(root, 'doc.md'), 'Run `argo frobnicate` first.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['doc.md'] })

    expect(findings.filter((f) => f.rule === 'unresolved-verb')).toEqual([])
  })

  it('resolves a path reference relative to the referencing file directory', () => {
    mkdirSync(join(root, 'skills', 'foo'), { recursive: true })
    writeFileSync(join(root, 'skills', 'foo', 'helper.ts'), 'export const y = 1\n')
    writeFileSync(join(root, 'skills', 'foo', 'SKILL.md'), 'See `./helper.ts`.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['skills/foo/SKILL.md'] })

    expect(findings).toEqual([])
  })

  it('respects a waiver for a specific rule and path', () => {
    writeFileSync(join(root, 'doc.md'), 'See `missing.ts`.\n')

    const { findings } = runCommentRefsCheck({
      cwd: root,
      paths: ['doc.md'],
      waivers: [{ rule: 'unresolved-file-reference', glob: 'doc.md', reason: 'placeholder pending' }]
    })

    expect(findings).toEqual([])
  })

  it('is advisory: reports findings without throwing', () => {
    writeFileSync(join(root, 'doc.md'), 'See `missing.ts` and `argo bogus`.\n')

    const result = runCommentRefsCheck({ cwd: root, paths: ['doc.md'], knownVerbs: ['status'] })

    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('walks a directory path and checks every doc file under it', () => {
    mkdirSync(join(root, 'rules', 'nested'), { recursive: true })
    writeFileSync(join(root, 'rules', 'a.md'), 'See `gone.ts`.\n')
    writeFileSync(join(root, 'rules', 'nested', 'b.md'), 'See `alsogone.ts`.\n')
    writeFileSync(join(root, 'rules', 'ignore.txt'), 'See `gone.ts`.\n')

    const { findings } = runCommentRefsCheck({ cwd: root, paths: ['rules'] })

    expect(findings.map((f) => f.token).sort()).toEqual(['alsogone.ts', 'gone.ts'])
  })
})
