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

  it('flags a multi-line comment block as a rationale smell', () => {
    const content = [
      '/*',
      ' * This explains at length why we chose this approach over the other',
      ' * approach, including the history of the decision and prior attempts',
      ' * that failed for various reasons over the past few months.',
      ' */',
      'export const y = 1'
    ].join('\n')
    writeFileSync(join(root, 'c.ts'), content)

    const { findings } = runCommentLint({ cwd: root, paths: ['c.ts'] })

    expect(findings).toContainEqual(expect.objectContaining({ rule: 'comment-block-length', file: 'c.ts' }))
  })

  it('does not flag a short WHY comment with no referential tokens', () => {
    writeFileSync(join(root, 'd.ts'), '// retries 3x: the upstream API is flaky under load\nexport const z = 1\n')

    const { findings } = runCommentLint({ cwd: root, paths: ['d.ts'] })

    expect(findings).toEqual([])
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
