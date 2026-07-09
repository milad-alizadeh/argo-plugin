import { describe, it, expect } from 'vitest'
import {
  unboundFillViolations,
  unboundStrokeViolations,
  unboundRadiusViolation,
  textStyleRequiredViolation,
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
  isCoverPageName,
  isDesignPageName,
  strokeScaleViolation,
  possibleGateFalsePositiveTag,
  unsectionedComponentViolation,
  missingComponentDescriptionViolation,
  compositeRegionNamingViolation,
  screenViewportMismatchViolation,
  textTruncationViolation,
  unclippedOverflowViolations,
  hugOverflowViolations,
  touchTargetViolation,
  textContrastViolation
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

describe('textStyleRequiredViolation', () => {
  it('flags a text node with no text style and no bindings', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {} }
    expect(textStyleRequiredViolation(node)).toEqual({
      rule: 'text-style-required',
      detail: 'text node has no defined text style; apply a preset text style from the type ramp'
    })
  })
  it('flags a text node that binds a raw fontSize variable instead of a text style', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: { fontSize: { id: '1:2' } } }
    expect(textStyleRequiredViolation(node)).toEqual({
      rule: 'text-style-required',
      detail: 'text node binds raw fontSize/lineHeight variables instead of a defined text style; apply a preset text style from the type ramp'
    })
  })
  it('flags a text node that binds a raw lineHeight variable instead of a text style', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: { lineHeight: { id: '3:4' } } }
    expect(textStyleRequiredViolation(node)?.rule).toBe('text-style-required')
  })
  it('passes a text node styled with a shared text style', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {}, textStyleId: 'S:abc123' }
    expect(textStyleRequiredViolation(node)).toBeNull()
  })
  it('passes a text node inside a library instance — kit internals carry their own text styling', () => {
    const node = { fontName: { family: 'Inter' }, boundVariables: {}, insideInstance: true }
    expect(textStyleRequiredViolation(node)).toBeNull()
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
  it('exempts a registered screen artboard (isScreenFrame) even with non-absolute stacked children', () => {
    const node = { type: 'FRAME', layoutMode: 'NONE', isScreenFrame: true, children: [{ layoutPositioning: 'AUTO' }] }
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
  // as a strokeWeight override on the instance — a live library
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

  it('flags a generic, non-code-mappable structural layer name (frame/group only)', () => {
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'container' })).toMatchObject({ rule: 'non-code-friendly-name' })
    expect(nonSemanticNameViolation({ type: 'GROUP', name: 'wrapper' })).toMatchObject({ rule: 'non-code-friendly-name' })
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'Box' })).toMatchObject({ rule: 'non-code-friendly-name' })
  })

  it('flags a structural layer name with spaces and suggests an identifier-safe form', () => {
    const v = nonSemanticNameViolation({ type: 'FRAME', name: 'viewed cluster' })
    expect(v).toMatchObject({ rule: 'non-code-friendly-name' })
    expect(v?.detail).toContain('viewed-cluster')
  })

  it('passes code-friendly structural names (kebab, camel, PascalCase)', () => {
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'file-diff-header' })).toBeNull()
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'changeCounts' })).toBeNull()
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'FileDiffHeader' })).toBeNull()
  })

  it('never flags TEXT nodes for spaces/generic words — a text layer name is usually its content, not a slot', () => {
    expect(nonSemanticNameViolation({ type: 'TEXT', name: '@@ -35,6 +35,9 @@' })).toBeNull()
    expect(nonSemanticNameViolation({ type: 'TEXT', name: 'src/auth/guard.ts' })).toBeNull()
    expect(nonSemanticNameViolation({ type: 'TEXT', name: 'content' })).toBeNull()
  })

  it('exempts the screen frame\'s OWN name from code-friendly-name — the D<NN> · Group · Title convention is mandated and never consumed as a code identifier', () => {
    // A top-level screen frame (isScreenFrame) carries the project's mandated
    // "D02 · Session · builder" naming; it is addressed by a CLI slug, never a
    // code identifier, so the spaces/generic predicate must not fire on it.
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'D02 · Session · builder', isScreenFrame: true })).toBeNull()
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'D05 · Cold open', isScreenFrame: true })).toBeNull()
  })

  it('still flags genuinely auto-generated screen-frame names even when isScreenFrame', () => {
    // Exemption is only for the human-authored convention, not for an unnamed
    // "Frame 12" left on the canvas.
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'Frame 12', isScreenFrame: true })).toMatchObject({
      rule: 'non-semantic-name'
    })
  })

  it('still flags spaces on non-screen structural containers (isScreenFrame only exempts the top-level frame itself)', () => {
    expect(nonSemanticNameViolation({ type: 'FRAME', name: 'viewed cluster', isScreenFrame: false })).toMatchObject({
      rule: 'non-code-friendly-name'
    })
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

describe('isCoverPageName', () => {
  it('matches the Cover page (design-language legend, never code-synced)', () => {
    expect(isCoverPageName('Cover')).toBe(true)
  })
  it('does not match a legacy W## page (wireframe stage removed — no exemption)', () => {
    expect(isCoverPageName('W00 Components')).toBe(false)
  })
  it('does not match a hi-fi foundations page', () => {
    expect(isCoverPageName('Foundations')).toBe(false)
  })
  it('does not match a hi-fi screens page', () => {
    expect(isCoverPageName('Hi-fi / Screens')).toBe(false)
  })
})

describe('isDesignPageName', () => {
  it('matches a hi-fi screen page name (D<NN> <group>)', () => {
    expect(isDesignPageName('D02 Onboarding')).toBe(true)
  })
  it('does not match a W-prefixed page name', () => {
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

describe('hugOverflowViolations (universal per-node, no tags/config)', () => {
  it('flags a HUG-horizontal node whose child extends past its right edge', () => {
    const node = {
      name: 'Row', x: 0, y: 0, width: 100, height: 32,
      layoutSizingHorizontal: 'HUG',
      children: [{ name: 'Label', x: 24, y: 0, width: 200, height: 32 }]
    }
    expect(hugOverflowViolations(node)).toEqual([
      { rule: 'hug-overflow-horizontal', detail: '"Row" is HUG-horizontal but child "Label" extends past its right edge' }
    ])
  })

  it('flags a HUG-vertical node whose child extends past its bottom edge', () => {
    const node = {
      name: 'Stack', x: 0, y: 0, width: 100, height: 32,
      layoutSizingVertical: 'HUG',
      children: [{ name: 'Body', x: 0, y: 8, width: 100, height: 64 }]
    }
    expect(hugOverflowViolations(node)).toEqual([
      { rule: 'hug-overflow-vertical', detail: '"Stack" is HUG-vertical but child "Body" extends past its bottom edge' }
    ])
  })

  it('passes contained children and non-HUG nodes', () => {
    const contained = {
      name: 'Row', x: 0, y: 0, width: 100, height: 32,
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
      children: [{ name: 'Label', x: 0, y: 0, width: 100, height: 32 }]
    }
    expect(hugOverflowViolations(contained)).toEqual([])
    const fixed = {
      name: 'Row', x: 0, y: 0, width: 100, height: 32,
      children: [{ name: 'Label', x: 24, y: 0, width: 200, height: 32 }]
    }
    expect(hugOverflowViolations(fixed)).toEqual([])
  })

  it('skips absolute-positioned children — out of flow, HUG never includes them', () => {
    const node = {
      name: 'row/head', x: 0, y: 0, width: 260, height: 14,
      layoutSizingVertical: 'HUG',
      children: [{ name: 'slot/close-button', layoutPositioning: 'ABSOLUTE', x: 280, y: -6, width: 26, height: 26 }]
    }
    expect(hugOverflowViolations(node)).toEqual([])
  })

  it('skips hidden children — they do not render, so they cannot overflow', () => {
    const node = {
      name: 'Breadcrumb', x: 24, y: 8, width: 125, height: 20,
      layoutSizingHorizontal: 'HUG',
      children: [{ name: 'Title', visible: false, x: 66, y: 0, width: 85, height: 20 }]
    }
    expect(hugOverflowViolations(node)).toEqual([])
  })

  it('tolerates sub-pixel float noise (0.1px epsilon)', () => {
    const node = {
      name: 'slot/close-button', x: 199, y: -6, width: 26, height: 26,
      layoutSizingVertical: 'HUG',
      children: [{ name: 'lucide/x', x: 6, y: 6, width: 14.000000953674316, height: 14.000000953674316 }]
    }
    expect(hugOverflowViolations(node)).toEqual([])
  })

  it('judges child bounds against the node dimensions, never node.x/node.y (different coordinate space)', () => {
    // node.x = 100 must not inflate the bound: child at 90..190 inside a
    // 120-wide HUG parent overflows regardless of where the parent sits
    const node = {
      name: 'Row', x: 100, y: 0, width: 120, height: 32,
      layoutSizingHorizontal: 'HUG',
      children: [{ name: 'Label', x: 90, y: 0, width: 100, height: 32 }]
    }
    expect(hugOverflowViolations(node)).toEqual([
      { rule: 'hug-overflow-horizontal', detail: '"Row" is HUG-horizontal but child "Label" extends past its right edge' }
    ])
  })
})

describe('touchTargetViolation (interactive = has prototype reactions, no tag needed)', () => {
  it('flags an interactive node smaller than 24x24', () => {
    const node = { name: 'Close', width: 16, height: 16, reactions: [{ trigger: { type: 'ON_CLICK' } }] }
    expect(touchTargetViolation(node)).toEqual({
      rule: 'touch-target-too-small',
      detail: '"Close" has prototype interactions but is 16x16px — below the 24x24px WCAG 2.5.8 minimum'
    })
  })

  it('passes an interactive node at or above 24x24', () => {
    expect(touchTargetViolation({ name: 'OK', width: 24, height: 24, reactions: [{}] })).toBeNull()
  })

  it('passes a non-interactive node of any size (no reactions)', () => {
    expect(touchTargetViolation({ name: 'Dot', width: 6, height: 6 })).toBeNull()
    expect(touchTargetViolation({ name: 'Dot', width: 6, height: 6, reactions: [] })).toBeNull()
  })

  it('exempts kit-instance internals', () => {
    expect(touchTargetViolation({ name: 'X', width: 8, height: 8, reactions: [{}], insideInstance: true })).toBeNull()
  })
})

describe('textContrastViolation (wcag-contrast package math, deterministic-or-skip)', () => {
  const solid = (r: number, g: number, b: number) => ({ type: 'SOLID', visible: true, opacity: 1, color: { r, g, b } })

  it('flags low-contrast normal text against a resolved solid background', () => {
    const node = {
      type: 'TEXT', name: 'Hint', fontSize: 13,
      fills: [solid(0.78, 0.78, 0.78)],
      ancestorSolidFill: solid(1, 1, 1)
    }
    const v = textContrastViolation(node)
    expect(v?.rule).toBe('wcag-contrast-fail')
    expect(v?.detail).toContain('below the WCAG AA threshold (4.5:1')
  })

  it('applies the 3:1 large-text threshold at fontSize >= 24', () => {
    const node = {
      type: 'TEXT', name: 'Title', fontSize: 24,
      fills: [solid(0.6, 0.6, 0.6)],
      ancestorSolidFill: solid(1, 1, 1)
    }
    // 0.6 gray on white is ~2.8:1 — fails even the relaxed 3:1 large-text bar
    expect(textContrastViolation(node)?.detail).toContain('(3:1')
  })

  it('passes sufficient contrast', () => {
    const node = {
      type: 'TEXT', name: 'Body', fontSize: 14,
      fills: [solid(0.1, 0.1, 0.1)],
      ancestorSolidFill: solid(1, 1, 1)
    }
    expect(textContrastViolation(node)).toBeNull()
  })

  it('skips (never guesses) when no solid ancestor background resolved', () => {
    const node = { type: 'TEXT', name: 'Overlay', fontSize: 14, fills: [solid(1, 1, 1)] }
    expect(textContrastViolation(node)).toBeNull()
  })

  it('skips semi-transparent fills, non-TEXT nodes, and kit internals', () => {
    const translucent = {
      type: 'TEXT', name: 'Ghost', fontSize: 14,
      fills: [{ type: 'SOLID', visible: true, opacity: 0.4, color: { r: 0, g: 0, b: 0 } }],
      ancestorSolidFill: solid(1, 1, 1)
    }
    expect(textContrastViolation(translucent)).toBeNull()
    expect(textContrastViolation({ type: 'FRAME', name: 'F', fills: [solid(0.8, 0.8, 0.8)], ancestorSolidFill: solid(1, 1, 1) })).toBeNull()
    expect(
      textContrastViolation({ type: 'TEXT', name: 'K', fontSize: 12, fills: [solid(0.8, 0.8, 0.8)], ancestorSolidFill: solid(1, 1, 1), insideInstance: true })
    ).toBeNull()
  })
})

describe('untracedCopyViolation (rule #13, design-phase-quality-plan.md W4)', async () => {
  const { untracedCopyViolation } = await import('./tier0-rules.js')
  const allowed = ['Workflow detail', 'Start a workflow', 'Session']
  const text = (characters: string, over: Record<string, unknown> = {}) => ({
    type: 'TEXT', name: 'label', characters, ...over
  })

  it('is inert when no copy deck is in play (copyAllowedStrings absent)', () => {
    expect(untracedCopyViolation(text('anything at all'), {})).toBeNull()
    expect(untracedCopyViolation(text('anything'), { copyAllowedStrings: null })).toBeNull()
  })

  it('passes a TEXT node whose content traces to a deck entry', () => {
    expect(untracedCopyViolation(text('Workflow detail'), { copyAllowedStrings: allowed })).toBeNull()
  })

  it('matches after whitespace normalization (canvas line-wraps do not fail the trace)', () => {
    expect(untracedCopyViolation(text('  Workflow\n detail '), { copyAllowedStrings: allowed })).toBeNull()
  })

  it('flags a TEXT node whose content traces to nothing', () => {
    const v = untracedCopyViolation(text('Wrokflow detial'), { copyAllowedStrings: allowed })
    expect(v?.rule).toBe('untraced-copy')
    expect(v?.detail).toContain('copy deck')
  })

  it('skips non-TEXT nodes, empty text, and letter-free data slots (counts, times)', () => {
    expect(untracedCopyViolation({ type: 'FRAME', name: 'f' }, { copyAllowedStrings: allowed })).toBeNull()
    expect(untracedCopyViolation(text('   '), { copyAllowedStrings: allowed })).toBeNull()
    expect(untracedCopyViolation(text('+12 / -3'), { copyAllowedStrings: allowed })).toBeNull()
    expect(untracedCopyViolation(text('12:04'), { copyAllowedStrings: allowed })).toBeNull()
  })

  it('does NOT exempt kit-instance internals: an un-overridden master default must trace via registry defaultStrings instead', () => {
    const v = untracedCopyViolation(text('Button', { insideInstance: true }), { copyAllowedStrings: allowed })
    expect(v?.rule).toBe('untraced-copy')
  })

  it('passes a documented component default carried in the allowed list', () => {
    expect(untracedCopyViolation(text('Button', { insideInstance: true }), { copyAllowedStrings: [...allowed, 'Button'] })).toBeNull()
  })
})
