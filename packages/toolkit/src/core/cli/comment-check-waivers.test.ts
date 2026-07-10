import { describe, expect, it } from 'vitest'
import { isWaived } from './comment-check-waivers.js'

describe('isWaived', () => {
  it('matches an exact rule + exact-path waiver', () => {
    const waivers = [{ rule: 'comment-referential', glob: 'src/legacy.ts', reason: 'pre-existing, migration pending' }]
    expect(isWaived(waivers, 'comment-referential', 'src/legacy.ts')).toBe(true)
  })

  it('does not match a different rule at the same path', () => {
    const waivers = [{ rule: 'comment-referential', glob: 'src/legacy.ts', reason: 'x' }]
    expect(isWaived(waivers, 'comment-block-length', 'src/legacy.ts')).toBe(false)
  })

  it('matches a ** glob across directories', () => {
    const waivers = [{ rule: 'comment-referential', glob: 'vendor/**/*.ts', reason: 'vendored code' }]
    expect(isWaived(waivers, 'comment-referential', 'vendor/pkg/deep/file.ts')).toBe(true)
    expect(isWaived(waivers, 'comment-referential', 'src/file.ts')).toBe(false)
  })

  it('matches a single * within one path segment', () => {
    const waivers = [{ rule: 'comment-ratio', glob: 'src/*.generated.ts', reason: 'codegen' }]
    expect(isWaived(waivers, 'comment-ratio', 'src/foo.generated.ts')).toBe(true)
    expect(isWaived(waivers, 'comment-ratio', 'src/nested/foo.generated.ts')).toBe(false)
  })

  it('returns false when no waiver matches', () => {
    expect(isWaived([], 'comment-referential', 'src/file.ts')).toBe(false)
  })
})
