import { describe, it, expect } from 'vitest'
import {
  unboundFillViolations,
  unboundStrokeViolations,
  unboundRadiusViolation,
  unboundTypeViolation,
  missingAutoLayoutViolation,
  handDrawnIconViolation,
  kitInstanceOverrideViolation,
  detachedInstanceViolation,
  nonSemanticNameViolation,
  variantNamingViolations,
  modeCopyViolations,
  implicitLineHeightViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations,
  isNamedAuditTarget,
  strokeScaleViolation,
  possibleGateFalsePositiveTag
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
  it('ignores nodes inside a library instance — kit internals bind their own kit collections', () => {
    const node = { fills: [{ type: 'SOLID', boundVariables: {} }], insideInstance: true }
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
  it('ignores nodes inside a library instance — kit internals bind their own kit collections', () => {
    const node = { strokes: [{ type: 'SOLID', boundVariables: {} }], insideInstance: true }
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
  it('passes a default cornerRadius of 0 with no radius design intent', () => {
    const node = { cornerRadius: 0, boundVariables: {} }
    expect(unboundRadiusViolation(node)).toBeNull()
  })
  it('passes a cornerRadius bound entirely via per-corner fields', () => {
    const node = {
      cornerRadius: 8,
      boundVariables: {
        topLeftRadius: { id: '1:1' },
        topRightRadius: { id: '1:2' },
        bottomLeftRadius: { id: '1:3' },
        bottomRightRadius: { id: '1:4' }
      }
    }
    expect(unboundRadiusViolation(node)).toBeNull()
  })
  it('passes a COMPONENT_SET container node regardless of its default editor-chrome cornerRadius', () => {
    const node = { type: 'COMPONENT_SET', cornerRadius: 5, boundVariables: {} }
    expect(unboundRadiusViolation(node)).toBeNull()
  })
  it('flags a cornerRadius with only some per-corner fields bound', () => {
    const node = {
      cornerRadius: 8,
      boundVariables: { topLeftRadius: { id: '1:1' } }
    }
    expect(unboundRadiusViolation(node)).toEqual({ rule: 'unbound-radius', detail: 'cornerRadius has no bound variable' })
  })
  it('passes a node inside a library instance — kit internals bind their own kit collections', () => {
    const node = { cornerRadius: 8, boundVariables: {}, insideInstance: true }
    expect(unboundRadiusViolation(node)).toBeNull()
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
  it('passes a text node styled with a shared text style, even with no bound fontSize', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {}, textStyleId: 'S:abc123' }
    expect(unboundTypeViolation(node)).toBeNull()
  })
  it('passes a text node inside a library instance — kit internals bind their own kit collections', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {}, insideInstance: true }
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
  it('passes a frame-like node inside a library instance — kit internals structure their own layout', () => {
    const node = { type: 'FRAME', layoutMode: 'NONE', insideInstance: true }
    expect(missingAutoLayoutViolation(node)).toBeNull()
  })
})

describe('handDrawnIconViolation', () => {
  it('flags a raw VECTOR glyph outside any library instance', () => {
    const node = { type: 'VECTOR', insideInstance: false }
    expect(handDrawnIconViolation(node)).toEqual({
      rule: 'hand-drawn-icon',
      detail: "raw vector glyph outside any library instance — use the design system's icon components"
    })
  })
})

describe('kitInstanceOverrideViolation', () => {
  it('passes a text-content (characters) override — labeling a kit component is sanctioned usage', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['characters'] }
    expect(kitInstanceOverrideViolation(node)).toBeNull()
  })

  it('passes a styledTextSegments override — Figma files sanctioned text recolors under this field, not fills (observed live)', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['styledTextSegments'] }
    expect(kitInstanceOverrideViolation(node)).toBeNull()
  })

  // Denylist, not whitelist (R10 reframe, 2026-07-05): the false-positive
  // economics of a hard gate demand a denylist of the specific illegal edits
  // (geometry/corner-radius/effects), not an allowlist that needs emergency
  // same-day growth every time a legitimate override is discovered.
  //
  // CARVE-OUT (live-file correction, 2026-07-05): strokeWeight is
  // deliberately NOT in this denylist. Figma records a proportional icon
  // rescale (the sanctioned fix for the R6/NEW-3 stroke-distortion gotcha)
  // as a strokeWeight override on the instance — argo-v2's live library
  // carries strokeWeight overrides on every correctly-rescaled icon.
  // strokeWeight legality is owned solely by the NEW-3
  // `strokeScaleViolation` proportionality rule, not this override check.
  it('passes a strokeWeight override — legality is owned by NEW-3, not this rule', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['fills', 'strokeWeight'] }
    expect(kitInstanceOverrideViolation(node)).toBeNull()
  })

  it('flags a remote kit instance overriding vectorPaths (geometry)', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['vectorPaths'] }
    expect(kitInstanceOverrideViolation(node)).toEqual({
      rule: 'kit-instance-override',
      detail: 'kit instance overrides "vectorPaths" — geometry/corner-radius/effects edits on kit internals are never legal'
    })
  })

  it('flags a remote kit instance overriding cornerRadius', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['cornerRadius'] }
    expect(kitInstanceOverrideViolation(node)).toEqual({
      rule: 'kit-instance-override',
      detail: 'kit instance overrides "cornerRadius" — geometry/corner-radius/effects edits on kit internals are never legal'
    })
  })

  it('flags a remote kit instance overriding effects', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['effects'] }
    expect(kitInstanceOverrideViolation(node)).toEqual({
      rule: 'kit-instance-override',
      detail: 'kit instance overrides "effects" — geometry/corner-radius/effects edits on kit internals are never legal'
    })
  })

  it('passes an override outside the denylist (fails open by design)', () => {
    const node = { type: 'INSTANCE', isRemoteInstance: true, overriddenFields: ['rotation'] }
    expect(kitInstanceOverrideViolation(node)).toBeNull()
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
  it('ignores auto-generated names inside a library instance — kit internals are not ours to rename', () => {
    expect(nonSemanticNameViolation({ name: 'Vector', insideInstance: true })).toBeNull()
  })

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

describe('isNamedAuditTarget', () => {
  it('matches a top-level FRAME by name (a screen or foundation frame)', () => {
    expect(isNamedAuditTarget({ name: 'foundations/sticker-sheet', type: 'FRAME' }, 'foundations/sticker-sheet')).toBe(true)
  })
  it('does not match a same-named node of a non-matchable type', () => {
    expect(isNamedAuditTarget({ name: 'Button', type: 'TEXT' }, 'Button')).toBe(false)
  })
})

describe('strokeScaleViolation (NEW-3)', () => {
  it('passes a properly proportionally-rescaled icon instance (within ±15% tolerance)', () => {
    const node = { instanceSize: 14, nativeSize: 24, baseStrokeWeight: 2, resolvedStrokeWeight: 14 / 24 * 2 }
    expect(strokeScaleViolation(node)).toBeNull()
  })

  it('flags a width/height-resized icon whose stroke weight was left unscaled (#4)', () => {
    const node = { instanceSize: 14, nativeSize: 24, baseStrokeWeight: 2, resolvedStrokeWeight: 2 }
    expect(strokeScaleViolation(node)).toEqual({
      rule: 'stroke-scale-mismatch',
      detail: "resolved strokeWeight 2 does not track the instance's rescale ratio (expected ~1.17) — the icon was likely resized, not rescaled proportionally"
    })
  })
})

describe('possibleGateFalsePositiveTag (R8)', () => {
  it('tags a remote kit instance whose only overrides are size/fill/stroke', () => {
    const node = { isRemoteInstance: true, overriddenFields: ['width', 'height', 'fills'] }
    expect(possibleGateFalsePositiveTag(node)).toBe(true)
  })

  it('does not tag a node that is neither a remote instance nor inside one', () => {
    const node = { isRemoteInstance: false, insideInstance: false, overriddenFields: ['fills'] }
    expect(possibleGateFalsePositiveTag(node)).toBe(false)
  })

  it('does not tag a remote instance whose overrides include a non-size/fill/stroke field', () => {
    const node = { isRemoteInstance: true, overriddenFields: ['fills', 'cornerRadius'] }
    expect(possibleGateFalsePositiveTag(node)).toBe(false)
  })
})

describe('gapPaddingSpacingViolations (D24, revised 2026-07-05: bind required)', () => {
  const spacingScale = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128]

  it('flags an unbound non-zero literal', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 8, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([
      { rule: 'gap-padding-unbound', detail: 'itemSpacing value 8 is an unbound literal; D24 requires binding a Primitives or Semantic spacing variable' }
    ])
  })

  it('passes an unbound zero literal', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingTop', value: 0, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('passes a value bound to the Primitives collection', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Primitives' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('passes a value bound to the Semantic collection', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Semantic' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('flags a value bound to a collection outside Primitives/Semantic', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Kit' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([
      { rule: 'gap-padding-foreign-binding', detail: 'paddingLeft is bound to a variable outside the project collections ("Kit"); D24 requires a Primitives or Semantic spacing variable' }
    ])
  })

  it('ignores COMPONENT_SET container nodes regardless of gapAndPadding contents', () => {
    const node = {
      type: 'COMPONENT_SET',
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('ignores nodes with layoutMode NONE regardless of gapAndPadding contents', () => {
    const node = {
      layoutMode: 'NONE',
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('ignores INSTANCE nodes themselves — their own gap/padding mirrors the component definition (kit tw/gap on the boundary node observed live)', () => {
    const node = {
      type: 'INSTANCE',
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 8, bound: true, collectionName: 'tw/gap' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })

  it('ignores nodes inside a library instance — kit internals bind the kit\'s own spacing collections', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      insideInstance: true,
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: true, collectionName: 'tw/gap' }]
    }
    expect(gapPaddingSpacingViolations(node, spacingScale)).toEqual([])
  })
})
