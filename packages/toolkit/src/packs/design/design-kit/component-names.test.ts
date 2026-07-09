import { describe, it, expect } from 'vitest'
import { normalizeComponentName, registryComponentNames } from './component-names.js'

describe('normalizeComponentName', () => {
  it('lowercases, strips separators, and drops a trailing plural s', () => {
    expect(normalizeComponentName('Status-Pill')).toBe('statuspill')
    expect(normalizeComponentName('rail_session cards')).toBe('railsessioncard')
  })
})

describe('registryComponentNames (composite-name set for compositeRegionNamingViolation)', () => {
  it("returns the registry entries' keys", () => {
    const registry = { components: { 'rail-session-card': { nodeId: '126:35' }, 'status-bar': { nodeId: '126:227' } } }
    expect(registryComponentNames(registry)).toEqual(['rail-session-card', 'status-bar'])
  })

  it('fails open (returns []) when the registry is absent or malformed', () => {
    expect(registryComponentNames(undefined)).toEqual([])
    expect(registryComponentNames({ components: 'nope' })).toEqual([])
  })
})
