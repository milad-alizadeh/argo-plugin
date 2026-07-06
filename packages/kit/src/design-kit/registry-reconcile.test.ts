import { describe, it, expect } from 'vitest'
import { reconcileRegistrySweep } from './registry-reconcile.js'

describe('reconcileRegistrySweep (design-memory-placement.md A3, figma-audit sweep ride-along)', () => {
  it('flags a live component with no registry entry (registry-unregistered)', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'Button', nodeId: '1:1', category: 'controls' }],
      registryEntries: []
    })
    expect(violations).toEqual([
      { rule: 'registry-unregistered', detail: 'live component "Button" has no registry entry' }
    ])
  })

  it('flags a registry entry whose nodeId no longer resolves and has no live match (registry-orphan)', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [],
      registryEntries: [{ name: 'Deleted', nodeId: '9:9', category: 'controls', nodeIdResolves: false }]
    })
    expect(violations).toEqual([
      { rule: 'registry-orphan', detail: 'registry entry "Deleted" nodeId no longer resolves and no live component with that name was found' }
    ])
  })

  it('flags a live component whose category disagrees with its registry entry (registry-miscategorized)', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'Button', nodeId: '1:1', category: 'status' }],
      registryEntries: [{ name: 'Button', nodeId: '1:1', category: 'controls' }]
    })
    expect(violations).toEqual([
      { rule: 'registry-miscategorized', detail: '"Button" lives under category "status" but the registry says "controls"' }
    ])
  })

  it('reports zero advisories on a clean, fully-registered sweep', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'Button', nodeId: '1:1', category: 'controls' }],
      registryEntries: [{ name: 'Button', nodeId: '1:1', category: 'controls' }]
    })
    expect(violations).toEqual([])
  })
})
