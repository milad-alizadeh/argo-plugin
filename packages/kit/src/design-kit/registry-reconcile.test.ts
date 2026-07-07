import { describe, it, expect } from 'vitest'
import { reconcileRegistrySweep, isScratchPageName, isKitPageName, isDividerPageName, kitPageIndices, extractVariantMatrix, buildKitRegistryEntries, isPascalCaseComponentName } from './registry-reconcile.js'

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

  it('excludes the project Screens page', () => {
    expect(isKitPageName('Screens')).toBe(false)
  })
})

describe('isDividerPageName', () => {
  it('matches pure and labeled dash separators, not real page names', () => {
    expect(isDividerPageName('---')).toBe(true)
    expect(isDividerPageName('------')).toBe(true)
    expect(isDividerPageName('──── Wireframes ────')).toBe(true)
    expect(isDividerPageName('Buttons')).toBe(false)
    expect(isDividerPageName('Calendar')).toBe(false)
  })
})

describe('kitPageIndices (positional divider-band classifier)', () => {
  // Mirrors the real shadcn starter's page order (verified live 2026-07-07).
  const REAL = [
    'Cover', 'About the libarary', 'Custom Components', 'Screens', '------',
    'Accordion', 'Button', 'Calendar', 'Sidebar', 'Tooltip', '---',
    'Examples', 'Dashboard', '---', 'Blocks', 'Sidebar', 'Calendar', '---',
    'Charts', 'Tooltip', '---', 'Lucide Icons', 'Tabler Icons', 'HugeIcons'
  ]

  it('selects only the first band after the first divider', () => {
    const kit = kitPageIndices(REAL)
    // primitives band = indices 5..9 (Accordion, Button, Calendar, Sidebar, Tooltip)
    expect([...kit].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9])
  })

  it('is collision-proof: the kit-band Calendar/Sidebar/Tooltip are in, the demo ones are out', () => {
    const kit = kitPageIndices(REAL)
    expect(kit.has(7)).toBe(true) // kit-band Calendar
    expect(kit.has(16)).toBe(false) // demo-band Calendar (same name, later index)
    expect(kit.has(8)).toBe(true) // kit-band Sidebar
    expect(kit.has(15)).toBe(false) // demo-band Sidebar
  })

  it('excludes icon-library pages (they live after the band)', () => {
    const kit = kitPageIndices(REAL)
    expect(kit.has(21)).toBe(false) // Lucide Icons
    expect(kit.has(23)).toBe(false) // HugeIcons
  })

  it('excludes a project page that strays into the band via the safety filter', () => {
    const kit = kitPageIndices(['Cover', '------', 'Button', 'Scratch - wip', 'Card', '---', 'Examples'])
    // band = indices 2,3,4; Scratch (index 3) is safety-filtered out
    expect([...kit].sort((a, b) => a - b)).toEqual([2, 4])
  })

  it('fails closed on a file with no divider structure (no kit pages, not every page)', () => {
    expect(kitPageIndices(['Cover', 'Custom Components', 'Buttons', 'Lucide Icons']).size).toBe(0)
  })

  it('handles a band that runs to end-of-file with no closing divider', () => {
    const kit = kitPageIndices(['Cover', '------', 'Button', 'Card'])
    expect([...kit].sort((a, b) => a - b)).toEqual([2, 3])
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

  it('carries an optional description through onto the lean entry (owner addendum)', () => {
    const now = '2026-07-07T00:00:00.000Z'
    const entries = buildKitRegistryEntries(
      { liveKitComponents: [{ name: 'Buttons', nodeId: '1:1', description: 'Primary/secondary/ghost button variants.' }], existingNames: new Set() },
      now
    )
    expect(entries.Buttons.description).toBe('Primary/secondary/ghost button variants.')
  })

  it('omits description entirely from the lean entry when the live component has none', () => {
    const entries = buildKitRegistryEntries(
      { liveKitComponents: [{ name: 'Buttons', nodeId: '1:1' }], existingNames: new Set() },
      '2026-07-07T00:00:00.000Z'
    )
    expect('description' in entries.Buttons).toBe(false)
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
