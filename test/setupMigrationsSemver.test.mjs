import { describe, it, expect } from 'vitest'
import { compareVersions } from '../packages/setup-migrations/semver.js'

describe('compareVersions', () => {
  it('returns negative when a < b', () => {
    expect(compareVersions('0.9.0', '0.11.0')).toBeLessThan(0)
  })
  it('returns 0 when equal', () => {
    expect(compareVersions('0.11.0', '0.11.0')).toBe(0)
  })
  it('returns positive when a > b', () => {
    expect(compareVersions('0.11.1', '0.11.0')).toBeGreaterThan(0)
  })
  it('compares each part numerically, not lexically (0.9.0 < 0.10.0)', () => {
    // the whole point: a lexical string compare would wrongly rank "0.9.0" > "0.10.0"
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
  })
})
