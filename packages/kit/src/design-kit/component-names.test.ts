import { describe, it, expect } from 'vitest'
import { findNewNameAliasCollision, normalizeComponentName, registryComponentNames } from './component-names.js'

describe('normalizeComponentName', () => {
  it('lowercases, strips separators, and drops a trailing plural s', () => {
    expect(normalizeComponentName('Status-Pill')).toBe('statuspill')
    expect(normalizeComponentName('rail_session cards')).toBe('railsessioncard')
  })
})

describe('findNewNameAliasCollision (anti-recreation backstop, design-first-council-ruling.md Gate ruling)', () => {
  it('hard-fails a NEW name that collides with an existing alias (PromptCard ≈ AskRow)', () => {
    const aliasMap = { components: [{ name: 'AskRow', aliases: ['PromptCard', 'InterruptCard'] }] }
    expect(findNewNameAliasCollision('PromptCard', aliasMap)).toEqual({
      rule: 'new-name-alias-collision',
      detail: 'NEW name "PromptCard" collides with existing component "AskRow" — reuse or extend it instead of recreating it'
    })
  })

  it('passes a genuinely novel NEW name', () => {
    const aliasMap = { components: [{ name: 'AskRow', aliases: ['PromptCard', 'InterruptCard'] }] }
    expect(findNewNameAliasCollision('DiffViewer', aliasMap)).toBeNull()
  })

  it('fails open (returns null) when the alias map is absent', () => {
    expect(findNewNameAliasCollision('PromptCard', undefined)).toBeNull()
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
