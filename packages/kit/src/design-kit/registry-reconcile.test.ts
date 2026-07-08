import { describe, it, expect } from 'vitest'
import { reconcileRegistrySweep, isScratchPageName, isKitPageName, isDividerPageName, kitPageIndices, extractVariantMatrix, buildKitRegistryEntries, detectChangedKitComponents, isPascalCaseComponentName, parseCodeOwnedPath, buildCodeOwnedEntries, deriveAdoption } from './registry-reconcile.js'

describe('deriveAdoption (directive 3 refined — kit adoption from instance usage)', () => {
  it('marks a kit master as adopted when a project surface instances it (by set nodeId or a child-variant id)', () => {
    const registryComponents = {
      Card: { kind: 'kit', nodeId: '5011:5273' },
      Breadcrumb: { kind: 'kit', nodeId: '665:2036' },
      Sonner: { kind: 'kit', nodeId: '1468:6037' },
      SessionCard: { kind: 'custom', nodeId: '50:1' }
    }
    // Card matched by its set nodeId; Breadcrumb matched by a child-variant id the walk also collected.
    const instancedNodeIds = ['5011:5273', '665:2100']
    const registryWithChild = { ...registryComponents, Breadcrumb: { kind: 'kit', nodeId: '665:2100' } }
    expect(deriveAdoption({ registryComponents, instancedNodeIds: ['5011:5273'] }).adoptedNames).toEqual(['Card'])
    expect(deriveAdoption({ registryComponents: registryWithChild, instancedNodeIds }).adoptedNames.sort()).toEqual(['Breadcrumb', 'Card'])
  })

  it('never marks custom/code-owned or an un-instanced (raw) kit master as adopted', () => {
    const registryComponents = {
      Sonner: { kind: 'kit', nodeId: '1468:6037' },
      SessionCard: { kind: 'custom', nodeId: '50:1' },
      Scene: { kind: 'code-owned', nodeId: '90:1' }
    }
    expect(deriveAdoption({ registryComponents, instancedNodeIds: ['50:1', '90:1'] }).adoptedNames).toEqual([])
  })
})

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

  it('excludes config nonKitPages even inside the band (demo dividers deleted -> icons adjacent to primitives)', () => {
    // After deleting demo pages + their dividers, icons sit in the same band as
    // primitives. Default nonKitPages (*Icons) keeps them out.
    const kit = kitPageIndices(['Custom Components', '------', 'Button', 'Card', 'Lucide Icons', 'HugeIcons'])
    expect([...kit].sort((a, b) => a - b)).toEqual([2, 3]) // Button, Card; icons excluded by pattern
  })

  it('honors a custom nonKitPages list (exact names + glob)', () => {
    const kit = kitPageIndices(
      ['Cover', '------', 'Button', 'Sandbox', 'Foo Icons'],
      ['Sandbox', '*Icons']
    )
    expect([...kit].sort((a, b) => a - b)).toEqual([2]) // Button only
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

describe('detectChangedKitComponents (manual Figma edit capture, directive 6)', () => {
  it('flags an existing kit component whose variantMatrix grew (a manually added variant)', () => {
    const changed = detectChangedKitComponents({
      liveKitComponents: [
        { name: 'Button', nodeId: '73:1', componentPropertyDefinitions: { variant: { type: 'VARIANT', variantOptions: ['primary', 'secondary', 'ghost'] } } }
      ],
      registryComponents: { Button: { kind: 'kit', variantMatrix: { variant: ['primary', 'secondary'] } } }
    })
    expect(changed).toEqual([
      { name: 'Button', reasons: ['variantMatrix changed'], variantMatrix: { variant: ['primary', 'secondary', 'ghost'] } }
    ])
  })

  it('flags a description edited directly in Figma', () => {
    const changed = detectChangedKitComponents({
      liveKitComponents: [{ name: 'Card', nodeId: '1:1', description: 'New copy' }],
      registryComponents: { Card: { kind: 'kit', variantMatrix: {}, description: 'Old copy' } }
    })
    expect(changed[0]).toMatchObject({ name: 'Card', reasons: ['description changed'], description: 'New copy' })
  })

  it('does not flag an unchanged component, a new one, or a custom entry', () => {
    const changed = detectChangedKitComponents({
      liveKitComponents: [
        { name: 'Button', nodeId: '73:1', componentPropertyDefinitions: { variant: { type: 'VARIANT', variantOptions: ['primary'] } } },
        { name: 'Brand', nodeId: '9:9' }, // new, no entry
        { name: 'SessionCard', nodeId: '5:5', componentPropertyDefinitions: { size: { type: 'VARIANT', variantOptions: ['lg'] } } }
      ],
      registryComponents: {
        Button: { kind: 'kit', variantMatrix: { variant: ['primary'] } },
        SessionCard: { kind: 'custom', variantMatrix: {} } // custom, not a kit-drift concern here
      }
    })
    expect(changed).toEqual([])
  })
})

describe('isPascalCaseComponentName (kit-name regression lock)', () => {
  it('accepts a plausible kit top-level component/page name', () => {
    expect(isPascalCaseComponentName('Buttons')).toBe(true)
  })
})

describe('parseCodeOwnedPath (@code-owned marker)', () => {
  it('extracts the repo-relative path from the marker line', () => {
    expect(parseCodeOwnedPath('Full-bleed backdrop. Category: scene.\n@code-owned: src/renderer/src/components/scene-wallpaper/SceneWallpaper.tsx')).toBe(
      'src/renderer/src/components/scene-wallpaper/SceneWallpaper.tsx'
    )
  })

  it('tolerates extra whitespace after the colon', () => {
    expect(parseCodeOwnedPath('@code-owned:    a/b/C.tsx')).toBe('a/b/C.tsx')
  })

  it('returns null when the marker is absent or the description is empty', () => {
    expect(parseCodeOwnedPath('Just a normal description.')).toBeNull()
    expect(parseCodeOwnedPath(undefined)).toBeNull()
    expect(parseCodeOwnedPath('')).toBeNull()
  })
})

describe('buildCodeOwnedEntries (deterministic derivation from the Figma marker)', () => {
  const marker = '@code-owned: src/components/scene-wallpaper/SceneWallpaper.tsx'

  it('emits a code-owned entry for a marker-carrying live component regardless of page band', () => {
    const { written, changed } = buildCodeOwnedEntries(
      { liveComponents: [{ name: 'SceneWallpaper', nodeId: '5091:7366', description: `Backdrop. ${marker}` }], registryComponents: {} },
      '2026-07-08T00:00:00Z'
    )
    expect(written.SceneWallpaper).toMatchObject({
      nodeId: '5091:7366',
      kind: 'code-owned',
      status: 'audit-clean',
      codePath: 'src/components/scene-wallpaper/SceneWallpaper.tsx',
      lastSyncedAt: '2026-07-08T00:00:00Z'
    })
    expect(changed[0]).toMatchObject({ name: 'SceneWallpaper', reasons: ['new code-owned'] })
  })

  it('ignores components with no marker', () => {
    const { written } = buildCodeOwnedEntries(
      { liveComponents: [{ name: 'Card', nodeId: '1:1', description: 'A card.' }], registryComponents: {} },
      '2026-07-08T00:00:00Z'
    )
    expect(written).toEqual({})
  })

  it('is a no-op (preserves lastSyncedAt) when the entry is unchanged', () => {
    const { written, changed } = buildCodeOwnedEntries(
      {
        liveComponents: [{ name: 'SceneWallpaper', nodeId: '5091:7366', description: `Backdrop. ${marker}` }],
        registryComponents: {
          SceneWallpaper: {
            kind: 'code-owned',
            nodeId: '5091:7366',
            codePath: 'src/components/scene-wallpaper/SceneWallpaper.tsx',
            status: 'audit-clean',
            variantMatrix: {},
            description: `Backdrop. ${marker}`
          }
        }
      },
      '2026-07-08T00:00:00Z'
    )
    expect(written).toEqual({})
    expect(changed).toEqual([])
  })

  it('re-stamps when the codePath drifts, preserving the prior status', () => {
    const { written, changed } = buildCodeOwnedEntries(
      {
        liveComponents: [{ name: 'SceneWallpaper', nodeId: '5091:7366', description: '@code-owned: src/new/Path.tsx' }],
        registryComponents: {
          SceneWallpaper: { kind: 'code-owned', nodeId: '5091:7366', codePath: 'src/old/Path.tsx', status: 'out-of-sync', variantMatrix: {} }
        }
      },
      '2026-07-08T00:00:00Z'
    )
    expect(written.SceneWallpaper).toMatchObject({ codePath: 'src/new/Path.tsx', status: 'out-of-sync' })
    expect(changed[0].reasons).toContain('codePath changed')
  })
})
