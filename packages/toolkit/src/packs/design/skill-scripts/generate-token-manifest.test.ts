import { describe, it, expect } from 'vitest'
import { generateTokenManifest } from './generate-token-manifest.js'

const tokens = {
  collections: [
    {
      name: 'Primitives',
      modes: [{ modeId: 'p:0', name: 'Value' }],
      variables: [
        { id: 'VariableID:1:1', name: 'color/zinc-50', valuesByMode: { 'p:0': { r: 0.98, g: 0.98, b: 0.98 } } },
        { id: 'VariableID:1:2', name: 'color/zinc-950', valuesByMode: { 'p:0': { r: 0.03, g: 0.03, b: 0.04 } } }
      ]
    },
    {
      name: 'Semantic',
      modes: [
        { modeId: 's:0', name: 'Light' },
        { modeId: 's:1', name: 'Dark' }
      ],
      variables: [
        {
          id: 'VariableID:2:1',
          name: 'surface/background',
          description: 'App background',
          valuesByMode: { 's:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' }, 's:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' } }
        },
        {
          id: 'VariableID:2:2',
          name: 'surface/foreground',
          valuesByMode: { 's:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' }, 's:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' } }
        },
        {
          id: 'VariableID:2:3',
          name: 'button/primary-bg',
          description: 'Primary action background',
          valuesByMode: { 's:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' } }
        },
        {
          id: 'VariableID:2:4',
          name: 'button/primary-fg',
          valuesByMode: { 's:0': { r: 1, g: 1, b: 1 } }
        },
        { id: 'VariableID:2:5', name: 'radius', description: 'Base corner radius' }
      ]
    }
  ]
}

describe('generateTokenManifest', () => {
  it('lists each Semantic variable on one line, grouped by prefix, sorted by group', () => {
    const manifest = generateTokenManifest(tokens)
    const buttonIndex = manifest.indexOf('## button/')
    const surfaceIndex = manifest.indexOf('## surface/')
    expect(buttonIndex).toBeGreaterThan(-1)
    expect(surfaceIndex).toBeGreaterThan(buttonIndex)
    expect(manifest).toContain('- button/primary-bg — Primary action background')
    expect(manifest).toContain('- surface/background — App background')
  })

  it('falls back to the resolved primitive alias NAME when a variable has no description', () => {
    const manifest = generateTokenManifest(tokens)
    expect(manifest).toContain('- surface/foreground — color/zinc-950')
  })

  it('emits a bare line when there is neither a description nor a resolvable alias', () => {
    const manifest = generateTokenManifest(tokens)
    expect(manifest).toContain('- button/primary-fg\n')
  })

  it('groups un-prefixed names under (ungrouped), after every real prefix group', () => {
    const manifest = generateTokenManifest(tokens)
    const ungroupedIndex = manifest.indexOf('## (ungrouped)')
    expect(ungroupedIndex).toBeGreaterThan(manifest.indexOf('## surface/'))
    expect(manifest).toContain('- radius — Base corner radius')
  })

  it('never enumerates primitives — only the Semantic collection is listed', () => {
    const manifest = generateTokenManifest(tokens)
    expect(manifest).not.toContain('- color/zinc-50')
    expect(manifest).not.toMatch(/^## color\//m)
  })

  it('respects a project-configured Semantic collection name', () => {
    const renamed = {
      collections: [
        {
          name: 'Theme',
          variables: [{ id: 'VariableID:3:1', name: 'surface/background', description: 'App background' }]
        }
      ]
    }
    const manifest = generateTokenManifest(renamed, { semanticCollectionName: 'Theme' })
    expect(manifest).toContain('# Theme token manifest')
    expect(manifest).toContain('- surface/background — App background')
  })

  it('throws loud when the Semantic collection is missing from the dump', () => {
    expect(() => generateTokenManifest({ collections: [{ name: 'Primitives', variables: [] }] })).toThrow(
      /no "Semantic" collection/
    )
  })
})
