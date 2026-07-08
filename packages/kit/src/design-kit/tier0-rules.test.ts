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
  implicitLineHeightViolation,
  emDashViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations,
  isNamedAuditTarget,
  isWireframePageName,
  isDesignPageName,
  strokeScaleViolation,
  possibleGateFalsePositiveTag,
  unsectionedComponentViolation,
  missingComponentDescriptionViolation,
  compositeRegionNamingViolation,
  screenViewportMismatchViolation,
  textTruncationViolation,
  unclippedOverflowViolations,
  missingRoleTagsViolation
} from './tier0-rules.js'

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
  it('flags a frame-like node with layoutMode NONE and stacked content', () => {
    const node = { type: 'FRAME', layoutMode: 'NONE', children: [{ layoutPositioning: 'AUTO' }] }
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
  it('exempts an absolute-canvas frame — every child is absolutely positioned', () => {
    const node = {
      type: 'FRAME',
      layoutMode: 'NONE',
      children: [{ layoutPositioning: 'ABSOLUTE' }, { layoutPositioning: 'ABSOLUTE' }]
    }
    expect(missingAutoLayoutViolation(node)).toBeNull()
  })
  it('still flags a no-Auto-Layout frame with a non-absolute child', () => {
    const node = {
      type: 'FRAME',
      layoutMode: 'NONE',
      children: [{ layoutPositioning: 'ABSOLUTE' }, { layoutPositioning: 'AUTO' }]
    }
    expect(missingAutoLayoutViolation(node)).toEqual({
      rule: 'missing-auto-layout',
      detail: 'frame-like node has no Auto Layout'
    })
  })
  it('exempts a zero-child frame — a leaf shape has nothing to lay out', () => {
    const node = { type: 'FRAME', layoutMode: 'NONE', children: [] }
    expect(missingAutoLayoutViolation(node)).toBeNull()
  })
  it('exempts a zero-child COMPONENT — leaf-shape variants like a status dot', () => {
    const node = { type: 'COMPONENT', layoutMode: 'NONE', children: [] }
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

describe('emDashViolation', () => {
  it('flags a TEXT node whose characters contain an em dash', () => {
    const node = { type: 'TEXT', characters: 'Slice 3 — wire routes' }
    expect(emDashViolation(node)).toEqual({
      rule: 'em-dash-in-text',
      detail: 'text contains an em dash; use a period, comma, colon, or · instead'
    })
  })
  it('passes a TEXT node without an em dash', () => {
    expect(emDashViolation({ type: 'TEXT', characters: 'Slice 3 · wire routes' })).toBeNull()
  })
  it('ignores non-TEXT nodes even when a name contains an em dash', () => {
    expect(emDashViolation({ type: 'COMPONENT', name: 'Card — compact' })).toBeNull()
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

describe('isWireframePageName', () => {
  it('matches a wireframe surface page name (W<NN> <group>)', () => {
    expect(isWireframePageName('W00 Components')).toBe(true)
  })
  it('matches another wireframe surface page name', () => {
    expect(isWireframePageName('W01 Shell & Rail')).toBe(true)
  })
  it('matches the Cover page (design-language legend, never code-synced)', () => {
    expect(isWireframePageName('Cover')).toBe(true)
  })
  it('does not match a hi-fi foundations page', () => {
    expect(isWireframePageName('Foundations')).toBe(false)
  })
  it('does not match a hi-fi screens page', () => {
    expect(isWireframePageName('Hi-fi / Screens')).toBe(false)
  })
})

describe('isDesignPageName', () => {
  it('matches a hi-fi screen page name (D<NN> <group>)', () => {
    expect(isDesignPageName('D02 Onboarding')).toBe(true)
  })
  it('does not match a wireframe page name', () => {
    expect(isDesignPageName('W02 Onboarding')).toBe(false)
  })
  it('does not match Custom Components', () => {
    expect(isDesignPageName('Custom Components')).toBe(false)
  })
})

describe('screenViewportMismatchViolation', () => {
  it('flags a mismatched width/height when isScreenFrame is true and viewport is configured', () => {
    const violation = screenViewportMismatchViolation(
      { width: 1440, height: 1120 },
      { isScreenFrame: true, viewport: { width: 1440, height: 900 } }
    )
    expect(violation).toEqual({
      rule: 'screen-viewport-mismatch',
      detail: 'screen frame is 1440x1120, expected 1440x900 (project canonical viewport)'
    })
  })

  it('passes an exact match', () => {
    const violation = screenViewportMismatchViolation(
      { width: 1440, height: 900 },
      { isScreenFrame: true, viewport: { width: 1440, height: 900 } }
    )
    expect(violation).toBeNull()
  })

  it('passes when isScreenFrame is false, even with a mismatch', () => {
    const violation = screenViewportMismatchViolation(
      { width: 1440, height: 1120 },
      { isScreenFrame: false, viewport: { width: 1440, height: 900 } }
    )
    expect(violation).toBeNull()
  })

  it('passes when viewport is undefined, even with isScreenFrame true', () => {
    const violation = screenViewportMismatchViolation({ width: 1440, height: 1120 }, { isScreenFrame: true })
    expect(violation).toBeNull()
  })
})

describe('textTruncationViolation', () => {
  it('flags a TEXT node with textTruncation ENDING', () => {
    const violation = textTruncationViolation({ type: 'TEXT', textTruncation: 'ENDING' })
    expect(violation).toEqual({
      rule: 'text-truncation',
      detail: 'text node is configured to truncate ("textTruncation: ENDING"), content can silently clip; auto-resize the text or size its box to the content instead'
    })
  })

  it('passes a TEXT node with textTruncation DISABLED', () => {
    expect(textTruncationViolation({ type: 'TEXT', textTruncation: 'DISABLED' })).toBeNull()
  })

  it('passes a TEXT node with no textTruncation field at all', () => {
    expect(textTruncationViolation({ type: 'TEXT' })).toBeNull()
  })

  it('ignores a non-TEXT node even if it somehow carries textTruncation ENDING', () => {
    expect(textTruncationViolation({ type: 'FRAME', textTruncation: 'ENDING' })).toBeNull()
  })
})

describe('unclippedOverflowViolations', () => {
  it("flags a child whose box extends past the parent's right edge when clipsContent is false", () => {
    const violations = unclippedOverflowViolations({
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [{ name: 'Segments', absoluteBoundingBox: { x: 0, y: 0, width: 140, height: 50 } }]
    })
    expect(violations).toEqual([
      { rule: 'unclipped-overflow', detail: 'child "Segments" extends beyond parent bounds while the parent has clipsContent disabled' }
    ])
  })

  it('passes when clipsContent is true', () => {
    const violations = unclippedOverflowViolations({
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [{ name: 'Segments', absoluteBoundingBox: { x: 0, y: 0, width: 140, height: 50 } }]
    })
    expect(violations).toEqual([])
  })

  it('passes when clipsContent is absent (not a clipping boundary), never throws on a non-frame', () => {
    expect(unclippedOverflowViolations({ children: [{ name: 'x', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }] })).toEqual([])
  })

  it("passes when the child is fully inside the parent's bounds", () => {
    const violations = unclippedOverflowViolations({
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [{ name: 'Segments', absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 20 } }]
    })
    expect(violations).toEqual([])
  })

  it('passes when the overflowing child has layoutPositioning ABSOLUTE (TreeNode-connector-rail carve-out)', () => {
    const violations = unclippedOverflowViolations({
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [{ name: 'Rail', layoutPositioning: 'ABSOLUTE', absoluteBoundingBox: { x: 0, y: 0, width: 140, height: 50 } }]
    })
    expect(violations).toEqual([])
  })

  it('passes when either box is missing, never throws on a partially-marshaled shape', () => {
    expect(
      unclippedOverflowViolations({ clipsContent: false, absoluteBoundingBox: undefined, children: [{ name: 'x' }] })
    ).toEqual([])
    expect(
      unclippedOverflowViolations({
        clipsContent: false,
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
        children: [{ name: 'x', absoluteBoundingBox: undefined }]
      })
    ).toEqual([])
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

describe('unsectionedComponentViolation (design-memory-placement.md, advisory)', () => {
  it('flags a top-level component not inside any category shelf frame', () => {
    const node = { type: 'COMPONENT', name: 'Button', insideCategoryShelf: false }
    expect(unsectionedComponentViolation(node)).toEqual({
      rule: 'unsectioned-component',
      detail: 'component "Button" is not a child of any category shelf frame on Custom Components'
    })
  })

  it('passes a component that is a child of a category shelf frame', () => {
    const node = { type: 'COMPONENT', name: 'Button', insideCategoryShelf: true }
    expect(unsectionedComponentViolation(node)).toBeNull()
  })
})

describe('missingComponentDescriptionViolation (Mechanism 3, advisory)', () => {
  it('flags a component with no description', () => {
    const node = { type: 'COMPONENT', name: 'Button', description: '' }
    expect(missingComponentDescriptionViolation(node)).toEqual({
      rule: 'missing-component-description',
      detail: 'component "Button" has no description (purpose + category, one line)'
    })
  })

  it('passes a component with a description', () => {
    const node = { type: 'COMPONENT', name: 'Button', description: 'Primary call-to-action. Category: controls.' }
    expect(missingComponentDescriptionViolation(node)).toBeNull()
  })
})

describe('compositeRegionNamingViolation (Option B, design-first-council-ruling.md Gate ruling, advisory)', () => {
  it('flags a plain FRAME named after a known composite as a traced-not-composed smell', () => {
    const node = { type: 'FRAME', name: 'RailSessionCard' }
    expect(compositeRegionNamingViolation(node, ['RailSessionCard', 'RailHeader'])).toEqual({
      rule: 'composite-region-traced-not-instance',
      detail: 'frame "RailSessionCard" is named after a composite component but is a plain FRAME, not an INSTANCE — looks traced, not composed'
    })
  })

  it('passes a proper INSTANCE named after a known composite', () => {
    const node = { type: 'INSTANCE', name: 'RailSessionCard' }
    expect(compositeRegionNamingViolation(node, ['RailSessionCard'])).toBeNull()
  })

  it('passes a FRAME whose name matches no known composite', () => {
    const node = { type: 'FRAME', name: 'SessionList' }
    expect(compositeRegionNamingViolation(node, ['RailSessionCard'])).toBeNull()
  })

  it('exempts a wrapper FRAME that directly contains an INSTANCE of the same composite (clip/shadow idiom)', () => {
    const node = {
      type: 'FRAME',
      name: 'RailSessionCard',
      children: [{ type: 'INSTANCE', name: 'RailSessionCard' }]
    }
    expect(compositeRegionNamingViolation(node, ['RailSessionCard'])).toBeNull()
  })

  it('still flags a same-named FRAME whose children are not an instance of it', () => {
    const node = {
      type: 'FRAME',
      name: 'RailSessionCard',
      children: [{ type: 'FRAME', name: 'inner' }, { type: 'TEXT', name: 'label' }]
    }
    expect(compositeRegionNamingViolation(node, ['RailSessionCard'])).toEqual({
      rule: 'composite-region-traced-not-instance',
      detail: 'frame "RailSessionCard" is named after a composite component but is a plain FRAME, not an INSTANCE — looks traced, not composed'
    })
  })
})

describe('gapPaddingSpacingViolations (D24, revised 2026-07-05: bind required)', () => {
  it('flags an unbound non-zero literal', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 8, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([
      { rule: 'gap-padding-unbound', detail: 'itemSpacing value 8 is an unbound literal; D24 requires binding a Primitives or Semantic spacing variable' }
    ])
  })

  it('passes an unbound zero literal', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingTop', value: 0, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('passes a value bound to the Primitives collection', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Primitives' }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('passes a value bound to the Semantic collection', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Semantic' }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('flags a value bound to a collection outside Primitives/Semantic', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'Kit' }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([
      { rule: 'gap-padding-foreign-binding', detail: 'paddingLeft is bound to a variable outside the project collections ("Kit"); D24 requires a Primitives or Semantic spacing variable' }
    ])
  })

  it('ignores COMPONENT_SET container nodes regardless of gapAndPadding contents', () => {
    const node = {
      type: 'COMPONENT_SET',
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('ignores nodes with layoutMode NONE regardless of gapAndPadding contents', () => {
    const node = {
      layoutMode: 'NONE',
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: false }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('ignores INSTANCE nodes themselves — their own gap/padding mirrors the component definition (kit tw/gap on the boundary node observed live)', () => {
    const node = {
      type: 'INSTANCE',
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'itemSpacing', value: 8, bound: true, collectionName: 'tw/gap' }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  it('ignores nodes inside a library instance — kit internals bind the kit\'s own spacing collections', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      insideInstance: true,
      gapAndPadding: [{ field: 'itemSpacing', value: 7, bound: true, collectionName: 'tw/gap' }]
    }
    expect(gapPaddingSpacingViolations(node)).toEqual([])
  })

  // Field bug regression (2026-07-07, live D01 build: a stock kit duplicate
  // named its Semantic collection "mode" and never renamed it — the check
  // used to hardcode "Semantic"/"Primitives" literally and hard-failed every
  // one of the kit's own untouched components).
  it('passes a value bound to a non-"Semantic" configured semantic collection name', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'mode' }]
    }
    expect(gapPaddingSpacingViolations(node, { semanticCollectionName: 'mode' })).toEqual([])
  })

  it('passes a value bound to a recipe-declared tw/* family collection', () => {
    const node = {
      layoutMode: 'HORIZONTAL',
      gapAndPadding: [{ field: 'paddingLeft', value: 24, bound: true, collectionName: 'tw/padding' }]
    }
    expect(gapPaddingSpacingViolations(node, { additionalAllowedCollectionNames: ['tw/gap', 'tw/padding', 'tw/margin', 'tw/space'] })).toEqual([])
  })
})

describe('missingRoleTagsViolation (geometry pass precondition)', () => {
  it('flags a requiresRoleTags root with zero role-tagged descendants', () => {
    const root = { name: 'List', children: [{ name: 'Row' }] }
    expect(missingRoleTagsViolation(root, { requiresRoleTags: true })).toEqual({
      rule: 'missing-role-tags',
      detail: 'component is in a geometry-checked category but has no #content-start/#rail/#anchor tagged nodes'
    })
  })

  it('passes a requiresRoleTags root with at least one role-tagged descendant', () => {
    const root = { name: 'List', children: [{ name: 'Row', children: [{ name: 'Icon #anchor' }] }] }
    expect(missingRoleTagsViolation(root, { requiresRoleTags: true })).toBeNull()
  })

  it('passes when requiresRoleTags is false (opt-in, non-breaking)', () => {
    const root = { name: 'List', children: [{ name: 'Row' }] }
    expect(missingRoleTagsViolation(root, { requiresRoleTags: false })).toBeNull()
  })
})
