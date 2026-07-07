import { describe, it, expect } from 'vitest'
import { reconcileRegistrySweep, isScratchPageName } from './registry-reconcile.js'

describe('reconcileRegistrySweep (design-memory-placement.md A3, figma-sync sweep)', () => {
  it('flags a live component with no registry entry (registry-unregistered)', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'Button', nodeId: '1:1' }],
      registryEntries: []
    })
    expect(violations).toEqual([
      { rule: 'registry-unregistered', detail: 'live component "Button" has no registry entry' }
    ])
  })

  it('flags a registry entry whose nodeId no longer resolves and has no live match (registry-orphan)', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [],
      registryEntries: [{ name: 'Deleted', nodeId: '9:9', nodeIdResolves: false }]
    })
    expect(violations).toEqual([
      { rule: 'registry-orphan', detail: 'registry entry "Deleted" nodeId no longer resolves and no live component with that name was found' }
    ])
  })

  it('reports zero advisories on a clean, fully-registered sweep', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'Button', nodeId: '1:1' }],
      registryEntries: [{ name: 'Button', nodeId: '1:1' }]
    })
    expect(violations).toEqual([])
  })

  it('excludes a live component on a Scratch-prefixed page from registry-unregistered', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'ThrowawayThing', nodeId: '2:2', pageName: 'Scratch - wip' }],
      registryEntries: []
    })
    expect(violations).toEqual([])
  })
})

describe('isScratchPageName', () => {
  it('matches a case-sensitive Scratch prefix', () => {
    expect(isScratchPageName('Scratch')).toBe(true)
    expect(isScratchPageName('Scratch - wip')).toBe(true)
    expect(isScratchPageName('scratch')).toBe(false)
    expect(isScratchPageName('Custom Components')).toBe(false)
  })
})
