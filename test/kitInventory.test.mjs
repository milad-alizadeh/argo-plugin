import { describe, it, expect } from 'vitest'
import { findKitNameCollisions } from '../packages/figma-design-kit/kit-inventory.js'

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

  it('flags a name that shadows an existing registry (project-owned) component too', () => {
    const registry = { components: { StatusPill: { nodeId: '1:1' } } }
    expect(findKitNameCollisions(['status-pill'], { registry })).toEqual(['status-pill'])
  })
})
