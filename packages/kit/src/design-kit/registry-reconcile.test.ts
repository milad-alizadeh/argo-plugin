import { describe, it, expect } from 'vitest'
import { reconcileRegistrySweep, isScratchPageName, isKitPageName, extractVariantMatrix, buildKitRegistryEntries, isPascalCaseComponentName } from './registry-reconcile.js'

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

describe('pascal-case component names', () => {
  it('flags a non-PascalCase live component name', () => {
    const violations = reconcileRegistrySweep({
      liveComponents: [{ name: 'session-card', nodeId: '3:3' }],
      registryEntries: [{ name: 'session-card', nodeId: '3:3' }]
    })
    expect(violations).toEqual([
      {
        rule: 'component-name-not-pascal',
        detail: 'component "session-card" must be PascalCase to match its React component name (e.g. "SessionCard")'
      }
    ])
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

describe('isKitPageName', () => {
  it('excludes every project-canonical page name (by-exclusion, not a name list)', () => {
    expect(isKitPageName('Custom Components')).toBe(false)
    expect(isKitPageName('Foundations')).toBe(false)
    expect(isKitPageName('Cover')).toBe(false)
    expect(isKitPageName('W03 Onboarding')).toBe(false)
    expect(isKitPageName('D03 Onboarding')).toBe(false)
    expect(isKitPageName('Scratch - wip')).toBe(false)
    expect(isKitPageName('──── Designs ────')).toBe(false)
  })

  it('treats an arbitrary starter-owned page name as kit', () => {
    expect(isKitPageName('Buttons')).toBe(true)
    expect(isKitPageName('Overlays')).toBe(true)
  })
})

describe('extractVariantMatrix', () => {
  it('keeps only VARIANT-typed property definitions and their options', () => {
    const matrix = extractVariantMatrix({
      size: { type: 'VARIANT', variantOptions: ['sm', 'md', 'lg'] },
      disabled: { type: 'BOOLEAN' }
    })
    expect(matrix).toEqual({ size: ['sm', 'md', 'lg'] })
  })
})

describe('buildKitRegistryEntries', () => {
  it('builds a lean draft entry for a live kit component with no existing registry entry', () => {
    const now = '2026-07-07T00:00:00.000Z'
    const entries = buildKitRegistryEntries(
      {
        liveKitComponents: [
          {
            name: 'Buttons',
            nodeId: '1:1',
            componentPropertyDefinitions: { size: { type: 'VARIANT', variantOptions: ['sm', 'md'] } }
          }
        ],
        existingNames: new Set()
      },
      now
    )
    expect(entries).toEqual({
      Buttons: {
        nodeId: '1:1',
        kind: 'kit',
        status: 'draft',
        lastSyncedAt: now,
        variantMatrix: { size: ['sm', 'md'] }
      }
    })
  })

  it('leaves an already-registered kit component out of the output entirely', () => {
    const entries = buildKitRegistryEntries(
      { liveKitComponents: [{ name: 'Buttons', nodeId: '1:1' }], existingNames: new Set(['Buttons']) },
      '2026-07-07T00:00:00.000Z'
    )
    expect(entries).toEqual({})
  })

  it('excludes lucide/* and demo/* live components entirely', () => {
    const entries = buildKitRegistryEntries(
      {
        liveKitComponents: [
          { name: 'lucide/arrow-right', nodeId: '2:1' },
          { name: 'demo/Playground', nodeId: '2:2' }
        ],
        existingNames: new Set()
      },
      '2026-07-07T00:00:00.000Z'
    )
    expect(entries).toEqual({})
  })
})

describe('isPascalCaseComponentName (kit-name regression lock)', () => {
  it('accepts a plausible kit top-level component/page name', () => {
    expect(isPascalCaseComponentName('Buttons')).toBe(true)
  })
})
