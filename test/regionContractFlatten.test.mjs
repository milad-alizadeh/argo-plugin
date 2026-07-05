import { describe, it, expect } from 'vitest'
import { flattenToRegions } from '../packages/figma-design-kit/region-contract.js'
import flattenFixture from './fixtures/flatten-metadata-tree.json' with { type: 'json' }

describe('flattenToRegions (C1 promotion rule: instance / auto-layout / cross-composite repeat -> regions row, else documentation-only)', () => {
  it('promotes an instance boundary to a regions row', () => {
    const regions = flattenToRegions(flattenFixture)

    expect(regions.find((r) => r.path === 'AppShell/Header')).toMatchObject({ name: 'Header', path: 'AppShell/Header', depth: 1 })
  })

  it('promotes an auto-layout container boundary and tags it kind: layout', () => {
    const regions = flattenToRegions(flattenFixture)

    expect(regions.find((r) => r.path === 'AppShell')).toMatchObject({ name: 'AppShell', path: 'AppShell', depth: 0, kind: 'layout' })
  })

  it('promotes a name that repeats across composites as a distinct region row per occurrence, not merged into one', () => {
    const regions = flattenToRegions(flattenFixture)
    const panelHeads = regions.filter((r) => r.name === 'PanelHead')

    expect(panelHeads.map((r) => r.path)).toEqual(['AppShell/Stage/PanelA/PanelHead', 'AppShell/Stage/PanelB/PanelHead'])
  })

  it('pins the full promotion set: plain frames and leaves (Logo, PanelA, PanelB, Label) never become regions rows, only documentation names in children', () => {
    const regions = flattenToRegions(flattenFixture)

    expect(regions.map((r) => r.path)).toEqual([
      'AppShell',
      'AppShell/Header',
      'AppShell/Stage',
      'AppShell/Stage/PanelA/PanelHead',
      'AppShell/Stage/PanelB/PanelHead'
    ])
    expect(regions.find((r) => r.path === 'AppShell').children).toEqual(['Header', 'Stage'])
    expect(regions.find((r) => r.path === 'AppShell/Stage').children).toEqual(['PanelA', 'PanelB', 'Label'])
  })
})
