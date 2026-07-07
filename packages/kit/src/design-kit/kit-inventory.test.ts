import { describe, it, expect } from 'vitest'
import { findKitNameCollisions, findNewNameAliasCollision, registryComponentNames } from './kit-inventory.js'

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

  it('matches via an alias when the authored name is EXACTLY the alias (e.g. "pill" -> Badge)', () => {
    const inventory = { components: [{ name: 'Badge', aliases: ['chip', 'tag', 'pill'] }] }
    expect(findKitNameCollisions(['pill'], { inventory })).toEqual(['pill'])
  })

  it('flags an exact-normalized match regardless of case/separators (e.g. "card" -> Card)', () => {
    const inventory = { components: [{ name: 'Card' }] }
    expect(findKitNameCollisions(['card'], { inventory })).toEqual(['card'])
  })

  // Owner ruling, 2026-07-07: substring matching produced false positives that
  // required hand-maintained kit-shadow waivers for ordinary compound names
  // that merely CONTAIN a short kit alias. These now pass with no waiver.
  it('does not flag a compound authored name that merely CONTAINS a short kit alias (no waiver needed)', () => {
    const inventory = { components: [{ name: 'Badge', aliases: ['chip', 'tag', 'pill'] }, { name: 'Card' }, { name: 'Panel' }] }
    expect(findKitNameCollisions(['status-pill', 'rail-session-card', 'terminal-panel'], { inventory })).toEqual([])
  })

  it('fails open (contributes zero) when the inventory is absent', () => {
    expect(findKitNameCollisions(['Collapsible'], {})).toEqual([])
  })

  // Self-shadow exclusion (council ruling, 2026-07-05): figma-create upserts
  // every component into the registry, so its own next audit would collide
  // with itself and block every re-audit forever. registryOthers filters out
  // any registry entry whose normalized value equals the authored name's
  // normalized value BEFORE matchesAny runs. Under exact-equality matching
  // (this change) that filter criterion and the match criterion are now
  // identical, so any name whose normalized form equals an existing registry
  // entry's normalized form is by construction always treated as self —
  // there is no longer a reachable "different name, same normalized form"
  // registry collision distinct from self (unlike the kit-inventory path,
  // where kitNames is never filtered by the authored name). A genuine
  // registry-level duplicate can only be caught elsewhere (e.g. the registry
  // itself refusing to key two components under the same normalized name).
  it('does not flag a component re-audit against its own registry entry (exact-name self match)', () => {
    const registry = { components: { 'status-pill': { nodeId: '1:1' } } }
    expect(findKitNameCollisions(['status-pill'], { registry })).toEqual([])
  })

  it('does not flag a name whose normalized form differs from every registry entry', () => {
    const registry = { components: { Card: { nodeId: '1:1' }, Badge: { nodeId: '1:2' } } }
    expect(findKitNameCollisions(['Panel'], { registry })).toEqual([])
  })

  it('clears an exact-normalized kit collision when a kit-shadow waiver names it', () => {
    const inventory = { components: [{ name: 'Card' }] }
    const waivers = [{ type: 'kit-shadow', component: 'card', kitCandidate: 'Card', reason: 'intentional visual divergence from the kit primitive' }]
    expect(findKitNameCollisions(['card'], { inventory, waivers })).toEqual([])
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
