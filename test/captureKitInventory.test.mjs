import { describe, it, expect } from 'vitest'
import { buildKitInventory } from '../packages/kit/src/skill-scripts/capture-kit-inventory.js'

describe('buildKitInventory', () => {
  it('shapes a header + components + icons, stripping any key/variantProps fields', () => {
    const components = [
      { name: 'Collapsible', type: 'COMPONENT_SET', aliases: ['accordion', 'disclosure'], purpose: 'Expandable panel', key: 'should-be-stripped', variantProps: { size: ['sm', 'lg'] } }
    ]
    const icons = { family: 'lucide/*', count: 1473, note: 'Search the kit icon page live for a specific glyph.' }
    const result = buildKitInventory(
      { components, icons },
      { kitLibraryFileKey: 'kit-file-key', kitSourceVersion: 'v1', now: 0 }
    )
    expect(result).toEqual({
      _usage:
        'Kit components are used AS-IS via base instances; prefer them over custom builds. Building custom when a kit component (or alias) matches requires a design/waivers.json entry naming the kit candidate and a concrete reason it is insufficient.',
      kitLibraryFileKey: 'kit-file-key',
      kitSourceVersion: 'v1',
      capturedAt: new Date(0).toISOString(),
      source: 'figma-kit-library',
      components: [{ name: 'Collapsible', type: 'COMPONENT_SET', aliases: ['accordion', 'disclosure'], purpose: 'Expandable panel' }],
      icons
    })
  })
})
