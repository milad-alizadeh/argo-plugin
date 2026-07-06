import { describe, it, expect } from 'vitest'
import { findKitNameCollisions, findNewNameAliasCollision, registryComponentNames } from '../packages/kit/src/design-kit/kit-inventory.js'

describe('findKitNameCollisions', () => {
  it('flags an authored component name that shadows a kit component with no clearing waiver', () => {
    const inventory = { components: [{ name: 'Collapsible', aliases: ['accordion', 'disclosure'] }] }
    expect(findKitNameCollisions(['Collapsible'], { inventory })).toEqual(['Collapsible'])
  })

  it('clears the collision when a kit-shadow waiver names the same component', () => {
    const inventory = { components: [{ name: 'Collapsible', aliases: ['accordion', 'disclosure'] }] }
    const waivers = [{ type: 'kit-shadow', component: 'Collapsible', kitCandidate: 'Collapsible', reason: 'needs a custom trigger icon the kit lacks' }]
    expect(findKitNameCollisions(['Collapsible'], { inventory, waivers })).toEqual([])
  })

  it('matches via an alias, not just the canonical kit name (e.g. status-pill -> Badge via "pill")', () => {
    const inventory = { components: [{ name: 'Badge', aliases: ['chip', 'tag', 'pill'] }] }
    expect(findKitNameCollisions(['status-pill'], { inventory })).toEqual(['status-pill'])
  })

  it('fails open (contributes zero) when the inventory is absent', () => {
    expect(findKitNameCollisions(['Collapsible'], {})).toEqual([])
  })

  it('flags a DIFFERENT name that shadows an existing registry (project-owned) component', () => {
    // 'status-pill-compact' contains registry key 'status-pill' but is not it —
    // a genuine duplicate-in-the-making; exact-equal names are the self case below.
    const registry = { components: { 'status-pill': { nodeId: '1:1' } } }
    expect(findKitNameCollisions(['status-pill-compact'], { registry })).toEqual([
      'status-pill-compact'
    ])
  })

  // Self-shadow exclusion (council ruling, 2026-07-05): figma-create upserts
  // every component into the registry, so its own next audit would collide
  // with itself and block every re-audit forever. An EXACT normalized name
  // match against a registry key is the component itself being re-audited —
  // never a collision; only a different name that substring-matches flags.
  it('does not flag a component re-audit against its own registry entry (exact-name self match)', () => {
    const registry = { components: { 'status-pill': { nodeId: '1:1' } } }
    expect(findKitNameCollisions(['status-pill'], { registry })).toEqual([])
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
  it('returns the registry entries\' keys', () => {
    const registry = { components: { 'rail-session-card': { nodeId: '126:35' }, 'status-bar': { nodeId: '126:227' } } }
    expect(registryComponentNames(registry)).toEqual(['rail-session-card', 'status-bar'])
  })

  it('fails open (returns []) when the registry is absent or malformed', () => {
    expect(registryComponentNames(undefined)).toEqual([])
    expect(registryComponentNames({ components: 'nope' })).toEqual([])
  })
})
