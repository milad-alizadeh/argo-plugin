import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCommentLint } from './comment-lint.js'

describe('runCommentLint', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'argo-comment-lint-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('flags a referential comment naming a sibling file', () => {
    writeFileSync(join(root, 'a.ts'), '// see helpers.ts for the retry logic\nexport const x = 1\n')

    const { findings } = runCommentLint({ cwd: root, paths: ['a.ts'] })

    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'comment-referential', file: 'a.ts' })
    )
  })

  it('flags a referential comment naming a path', () => {
    writeFileSync(root + '/b.py', '# see src/core/config.py for the schema\nx = 1\n')

    const { findings } = runCommentLint({ cwd: root, paths: ['b.py'] })

    expect(findings).toContainEqual(expect.objectContaining({ rule: 'comment-referential', file: 'b.py' }))
  })

  it('flags a multi-paragraph comment block as a narrative smell', () => {
    const content = [
      '/*',
      ' * Why we chose this approach over the other one.',
      ' *',
      ' * The history: prior attempts failed for various reasons over months.',
      ' */',
      'export const y = 1'
    ].join('\n')
    writeFileSync(join(root, 'c.ts'), content)

    const { findings } = runCommentLint({ cwd: root, paths: ['c.ts'] })

    expect(findings).toContainEqual(expect.objectContaining({ rule: 'comment-narrative', file: 'c.ts' }))
  })

  it('does not flag a short WHY comment with no referential tokens', () => {
    writeFileSync(join(root, 'd.ts'), '// retries 3x: the upstream API is flaky under load\nexport const z = 1\n')

    const { findings } = runCommentLint({ cwd: root, paths: ['d.ts'] })

    expect(findings).toEqual([])
  })

  it('does not flag a dense single-paragraph multi-line WHY (the rule sanctions it)', () => {
    const content = [
      '/*',
      ' * Fails closed: a missing config must block, not pass, because this runs',
      ' * in a PreToolUse gate where a silent default would let an unguarded edit',
      ' * through — the one failure mode this whole check exists to prevent.',
      ' */',
      'export const guard = 1'
    ].join('\n')
    writeFileSync(join(root, 'why.ts'), content)

    const { findings } = runCommentLint({ cwd: root, paths: ['why.ts'] })

    expect(findings.filter((f) => f.rule === 'comment-narrative')).toEqual([])
  })

  it('does not flag a multi-line JSDoc contract block on an export', () => {
    const content = [
      '/**',
      ' * Resolves the active instance for a session.',
      ' *',
      ' * @param key the instance key',
      ' * @returns the instance, or null when none is active',
      ' */',
      'export function resolve(key: string) { return key }'
    ].join('\n')
    writeFileSync(join(root, 'doc.ts'), content)

    const { findings } = runCommentLint({ cwd: root, paths: ['doc.ts'] })

    expect(findings.filter((f) => f.rule === 'comment-narrative')).toEqual([])
  })

  it('flags a high comment-to-code ratio in a file', () => {
    const lines: string[] = []
    for (let i = 0; i < 10; i++) {
      lines.push(`// comment number ${i}`)
    }
    lines.push('export const total = 1')
    writeFileSync(join(root, 'e.ts'), lines.join('\n'))

    const { findings } = runCommentLint({ cwd: root, paths: ['e.ts'] })

    expect(findings).toContainEqual(expect.objectContaining({ rule: 'comment-ratio', file: 'e.ts' }))
  })

  it('respects a waiver for a specific rule and path', () => {
    writeFileSync(join(root, 'f.ts'), '// see helpers.ts\nexport const w = 1\n')

    const { findings } = runCommentLint({
      cwd: root,
      paths: ['f.ts'],
      waivers: [{ rule: 'comment-referential', glob: 'f.ts', reason: 'legacy, migration pending' }]
    })

    expect(findings).toEqual([])
  })

  it('walks a directory recursively when given a directory path', () => {
    mkdirSync(join(root, 'nested'), { recursive: true })
    writeFileSync(join(root, 'nested', 'g.ts'), '// see config.ts\nexport const g = 1\n')

    const { findings } = runCommentLint({ cwd: root, paths: ['.'] })

    expect(findings).toContainEqual(expect.objectContaining({ rule: 'comment-referential', file: 'nested/g.ts' }))
  })

  it('is advisory: always reports rather than throwing, regardless of finding count', () => {
    writeFileSync(join(root, 'h.ts'), '// see a.ts\n// see b.ts\nexport const h = 1\n')

    const result = runCommentLint({ cwd: root, paths: ['h.ts'] })

    expect(result.findings.length).toBeGreaterThan(0)
  })
})
