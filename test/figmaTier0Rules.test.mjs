import { describe, it, expect } from 'vitest'
import {
  unboundFillViolations,
  unboundStrokeViolations,
  unboundRadiusViolation,
  unboundTypeViolation,
  missingAutoLayoutViolation,
  detachedInstanceViolation,
  nonSemanticNameViolation,
  variantNamingViolations,
  modeCopyViolations,
  implicitLineHeightViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations
} from '../packages/figma-design-kit/tier0-rules.js'

describe('unboundFillViolations', () => {
  it('flags a solid fill with no bound color variable', () => {
    const node = { fills: [{ type: 'SOLID', boundVariables: {} }] }
    expect(unboundFillViolations(node)).toEqual([{ rule: 'unbound-fill', detail: 'solid fill has no bound color variable' }])
  })
  it('passes a solid fill with a bound color variable', () => {
    const node = { fills: [{ type: 'SOLID', boundVariables: { color: { id: '1:2' } } }] }
    expect(unboundFillViolations(node)).toEqual([])
  })
  it('ignores non-solid fills', () => {
    const node = { fills: [{ type: 'GRADIENT_LINEAR', boundVariables: {} }] }
    expect(unboundFillViolations(node)).toEqual([])
  })
})

describe('unboundStrokeViolations', () => {
  it('flags a solid stroke with no bound color variable', () => {
    const node = { strokes: [{ type: 'SOLID', boundVariables: {} }] }
    expect(unboundStrokeViolations(node)).toEqual([{ rule: 'unbound-stroke', detail: 'solid stroke has no bound color variable' }])
  })
  it('passes a solid stroke with a bound color variable', () => {
    const node = { strokes: [{ type: 'SOLID', boundVariables: { color: { id: '1:2' } } }] }
    expect(unboundStrokeViolations(node)).toEqual([])
  })
})

describe('unboundRadiusViolation', () => {
  it('flags a numeric cornerRadius with no bound variable', () => {
    const node = { cornerRadius: 8, boundVariables: {} }
    expect(unboundRadiusViolation(node)).toEqual({ rule: 'unbound-radius', detail: 'cornerRadius has no bound variable' })
  })
  it('passes a bound cornerRadius', () => {
    const node = { cornerRadius: 8, boundVariables: { cornerRadius: { id: '1:2' } } }
    expect(unboundRadiusViolation(node)).toBeNull()
  })
  it('passes a node with no cornerRadius', () => {
    expect(unboundRadiusViolation({})).toBeNull()
  })
})

describe('unboundTypeViolation', () => {
  it('flags a text node with no bound fontSize', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {} }
    expect(unboundTypeViolation(node)).toEqual({ rule: 'unbound-type', detail: 'text node font size has no bound variable' })
  })
  it('passes a text node with a bound fontSize', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: { fontSize: { id: '1:2' } } }
    expect(unboundTypeViolation(node)).toBeNull()
  })
})

describe('missingAutoLayoutViolation', () => {
  it('flags a frame-like node with layoutMode NONE', () => {
    const node = { type: 'FRAME', layoutMode: 'NONE' }
    expect(missingAutoLayoutViolation(node)).toEqual({ rule: 'missing-auto-layout', detail: 'frame-like node has no Auto Layout' })
  })
  it('passes a frame with Auto Layout', () => {
    const node = { type: 'FRAME', layoutMode: 'VERTICAL' }
    expect(missingAutoLayoutViolation(node)).toBeNull()
  })
  it('ignores non-frame-like node types', () => {
    expect(missingAutoLayoutViolation({ type: 'TEXT', layoutMode: 'NONE' })).toBeNull()
  })
})

describe('detachedInstanceViolation', () => {
  it('flags an instance with no resolvable main component', () => {
    const node = { type: 'INSTANCE', hasMainComponent: false }
    expect(detachedInstanceViolation(node)).toEqual({ rule: 'detached-instance', detail: 'instance has no resolvable main component' })
  })
  it('passes an instance with a resolvable main component', () => {
    expect(detachedInstanceViolation({ type: 'INSTANCE', hasMainComponent: true })).toBeNull()
  })
})

describe('nonSemanticNameViolation', () => {
  it('flags an auto-generated default name', () => {
    expect(nonSemanticNameViolation({ name: 'Rectangle 12' })).toEqual({
      rule: 'non-semantic-name',
      detail: 'node name "Rectangle 12" looks auto-generated, not semantic'
    })
  })
  it('passes a semantic name', () => {
    expect(nonSemanticNameViolation({ name: 'PrimaryButton' })).toBeNull()
  })
})

describe('variantNamingViolations', () => {
  it('flags a Title-Case variant property (D18)', () => {
    const node = { type: 'COMPONENT_SET', componentPropertyDefinitions: { Size: {} } }
    expect(variantNamingViolations(node)).toEqual([
      { rule: 'variant-naming', detail: 'variant property "Size" should be lowercase (D18)' }
    ])
  })
  it('passes lowercase variant properties', () => {
    const node = { type: 'COMPONENT_SET', componentPropertyDefinitions: { size: {} } }
    expect(variantNamingViolations(node)).toEqual([])
  })
  it('ignores non-COMPONENT_SET nodes', () => {
    expect(variantNamingViolations({ type: 'COMPONENT', componentPropertyDefinitions: { Size: {} } })).toEqual([])
  })
})

describe('modeCopyViolations (D11, generalized to mode copies)', () => {
  it('flags a component with no adjacent copy for a non-default mode', () => {
    const node = { type: 'COMPONENT', name: 'Button', siblings: [] }
    expect(modeCopyViolations(node, 'Semantic', ['Light', 'Dark'])).toEqual([
      { rule: 'missing-mode-copy', detail: 'component has no adjacent "Dark" mode instance copy (D11)' }
    ])
  })
  it('flags a mode copy that does not explicitly set the Semantic mode', () => {
    const node = {
      type: 'COMPONENT',
      name: 'Button',
      siblings: [{ name: 'Button (Dark)', explicitVariableModes: {} }]
    }
    expect(modeCopyViolations(node, 'Semantic', ['Light', 'Dark'])).toEqual([
      { rule: 'incorrect-mode-copy', detail: '"Dark" mode copy does not set the Semantic collection mode explicitly' }
    ])
  })
  it('passes a correctly-configured mode copy', () => {
    const node = {
      type: 'COMPONENT',
      name: 'Button',
      siblings: [{ name: 'Button (Dark)', explicitVariableModes: { Semantic: 'dark-mode-id' } }]
    }
    expect(modeCopyViolations(node, 'Semantic', ['Light', 'Dark'])).toEqual([])
  })
  it('requires zero copies for a single-mode Semantic collection', () => {
    const node = { type: 'COMPONENT', name: 'Button', siblings: [] }
    expect(modeCopyViolations(node, 'Semantic', ['Dark'])).toEqual([])
  })
  it('flags one violation per missing non-default mode copy, beyond the default', () => {
    const node = { type: 'COMPONENT', name: 'Button', siblings: [] }
    expect(modeCopyViolations(node, 'Semantic', ['Light', 'Dark', 'High Contrast'])).toEqual([
      { rule: 'missing-mode-copy', detail: 'component has no adjacent "Dark" mode instance copy (D11)' },
      { rule: 'missing-mode-copy', detail: 'component has no adjacent "High Contrast" mode instance copy (D11)' }
    ])
  })
  it('ignores non-component/component-set node types', () => {
    expect(modeCopyViolations({ type: 'FRAME', name: 'Screen', siblings: [] }, 'Semantic', ['Light', 'Dark'])).toEqual([])
  })
})

describe('implicitLineHeightViolation (D20)', () => {
  it('flags implicit AUTO line-height', () => {
    const node = { lineHeight: { unit: 'AUTO' } }
    expect(implicitLineHeightViolation(node)).toEqual({
      rule: 'implicit-line-height',
      detail: 'text node uses implicit AUTO line-height; must be explicit (D20)'
    })
  })
  it('passes an explicit line-height', () => {
    expect(implicitLineHeightViolation({ lineHeight: { unit: 'PIXELS', value: 20 } })).toBeNull()
  })
})

describe('storyUrlScopeViolation (D1)', () => {
  it('flags a file-level (non-node-scoped) story URL', () => {
    const node = { type: 'COMPONENT', storyUrl: 'https://storybook.example/?path=/story/button' }
    expect(storyUrlScopeViolation(node)).toEqual({
      rule: 'non-node-scoped-story-url',
      detail: 'storyUrl "https://storybook.example/?path=/story/button" is not node-scoped'
    })
  })
  it('passes a node-scoped story URL', () => {
    const node = { type: 'COMPONENT', storyUrl: 'https://storybook.example/?node-id=1-2' }
    expect(storyUrlScopeViolation(node)).toBeNull()
  })
  it('ignores a component with no storyUrl', () => {
    expect(storyUrlScopeViolation({ type: 'COMPONENT' })).toBeNull()
  })
})

describe('gapPaddingSpacingViolations (D24)', () => {
  const spacingScale = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128]

  it('passes an unbound value that is a member of the spacing scale', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 8, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('flags an unbound value that is not a member of the spacing scale, one violation per offending field', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [
        { field: 'itemSpacing', value: 7, bound: false },
        { field: 'paddingTop', value: 6, bound: false }
      ]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([
      { rule: 'gap-padding-off-scale', detail: 'itemSpacing value 7 is not on the Primitives spacing scale and is not bound to a Semantic spacing variable (D24)' }
    ])
  })

  it('passes a value bound to the Semantic collection regardless of its value', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Semantic' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('flags a value bound directly to a Primitive variable (not Semantic)', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Primitives' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([
      { rule: 'gap-padding-non-semantic-binding', detail: 'paddingLeft is bound to a non-Semantic variable ("Primitives"); D24 requires a Semantic spacing variable or an on-scale literal' }
    ])
  })

  it('ignores nodes with layoutMode NONE regardless of gapAndPadding contents', () => {
    const node = {
      layoutMode: 'NONE',
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })
})
