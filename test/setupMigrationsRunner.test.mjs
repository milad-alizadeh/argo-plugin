import { describe, it, expect } from 'vitest'
import { pendingMigrations } from '../packages/setup-migrations/runner.js'

const migs = [
  { id: 'a', sinceVersion: '0.8.0' },
  { id: 'c', sinceVersion: '0.11.0' },
  { id: 'b', sinceVersion: '0.9.0' }
]

describe('pendingMigrations', () => {
  it('returns migrations at or above the recorded version, sorted ascending', () => {
    expect(pendingMigrations('0.9.0', migs).map((m) => m.id)).toEqual(['b', 'c'])
  })
  it('includes a migration at exactly the recorded version (inclusive-of-current)', () => {
    // a project set up mid-version-bump must still see a same-version migration;
    // the migration's own detect() gates whether it actually applies.
    expect(pendingMigrations('0.11.0', migs).map((m) => m.id)).toEqual(['c'])
  })
  it('excludes migrations below the recorded version', () => {
    const ids = pendingMigrations('0.11.0', migs).map((m) => m.id)
    expect(ids).not.toContain('a')
    expect(ids).not.toContain('b')
  })
  it('defaults to the shipped migrations registry when none is passed', () => {
    expect(Array.isArray(pendingMigrations('0.0.0'))).toBe(true)
  })
})
