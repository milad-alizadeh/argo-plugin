/**
 * Tier-0 mechanism rules (figma-to-code-pipeline.md §5 tier 0), extracted from
 * templates/design/tier0-audit.js into pure predicate functions over plain-object
 * node/variable shapes — no `figma.*` calls, so these are unit-testable outside
 * Figma's Plugin API sandbox. The recipe-owned rules (non-semantic-binding,
 * retired-file-key-binding, kit-patches-conformance) live in the sibling
 * `figma-design-kit-shadcn-tailwind` package, not here (D23).
 *
 * Each function returns a violation object `{ rule, detail }` (or an array of
 * them, for checks that can fire more than once per node), or `null`/`[]` when
 * the node passes. Callers (the Plugin-API walker) attach severity/nodeId/
 * nodeName, which depend on audit context, not rule logic.
 *
 * Node/variable shapes here are walker-marshaled plain objects mirroring a
 * subset of Figma's Plugin API node fields, not a modeled Figma type — kept
 * as `any`-keyed records deliberately (this migration adds compile-time
 * typing to the module's own logic, not a full Figma domain model).
 */

export type Violation = { rule: string; detail: string }
type AnyNode = Record<string, any>

export function unboundFillViolations(node: AnyNode): Violation[] {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own color collections — not ours to
  // rebind; flagging them made a pristine kit instance (e.g. Switch) fail
  // the hard gate on its own internal frames.
  if (node.insideInstance) return []
  const violations: Violation[] = []
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && !fill.boundVariables?.color) {
        violations.push({ rule: 'unbound-fill', detail: 'solid fill has no bound color variable' })
      }
    }
  }
  return violations
}

export function unboundStrokeViolations(node: AnyNode): Violation[] {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own color collections — not ours to
  // rebind; see unboundFillViolations for the same reasoning.
  if (node.insideInstance) return []
  const violations: Violation[] = []
  if ('strokes' in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && !stroke.boundVariables?.color) {
        violations.push({ rule: 'unbound-stroke', detail: 'solid stroke has no bound color variable' })
      }
    }
  }
  return violations
}

const PER_CORNER_RADIUS_FIELDS = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']

/**
 * A `cornerRadius` of 0 (or absent) carries no radius design intent, so it's
 * never flagged — every plain frame defaults to 0. A radius counts as bound
 * either via the uniform `boundVariables.cornerRadius`, or via all four
 * per-corner fields being bound (the only bindable radius fields on many
 * node types) — fix: 2026-07, closed a 71-hit false-positive class. A
 * COMPONENT_SET container node is skipped entirely: Figma gives every
 * combineAsVariants container a default cornerRadius of 5 (the purple
 * dashed editor chrome), which is not a design surface and can't
 * meaningfully bind a token.
 */
export function unboundRadiusViolation(node: AnyNode): Violation | null {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own radius collections — not ours to rebind.
  if (node.insideInstance) return null
  if (node.type === 'COMPONENT_SET') return null
  if (!('cornerRadius' in node) || typeof node.cornerRadius !== 'number' || node.cornerRadius === 0) return null
  const bound = node.boundVariables ?? {}
  const boundUniform = Boolean(bound.cornerRadius)
  const boundPerCorner = PER_CORNER_RADIUS_FIELDS.every((field) => Boolean(bound[field]))
  if (boundUniform || boundPerCorner) return null
  return { rule: 'unbound-radius', detail: 'cornerRadius has no bound variable' }
}

/**
 * Passes a text node bound directly to a fontSize variable OR carrying a
 * shared text style (the pack's own text-styling convention) — `textStyleId`
 * is `figma.mixed` (an object) when mixed across a range, and `''` when
 * unset, so only a non-empty string counts as "styled" (fix: 2026-07,
 * closed a 45-hit false-positive class on a properly text-styled sheet).
 */
export function unboundTypeViolation(node: AnyNode): Violation | null {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own type collections — not ours to rebind.
  if (node.insideInstance) return null
  if (!('fontName' in node)) return null
  const hasBoundFontSize = Boolean(node.boundVariables?.fontSize)
  const hasTextStyle = typeof node.textStyleId === 'string' && node.textStyleId !== ''
  if (!hasBoundFontSize && !hasTextStyle) {
    return { rule: 'unbound-type', detail: 'text node font size has no bound variable' }
  }
  return null
}

/**
 * Deny the CONFIGURATION, not a computed overflow (same R10 denylist
 * economics as kitInstanceOverrideViolation: a hard gate's false-positive
 * cost is asymmetric, and there is no cheap, reliable Plugin-API signal
 * for "is this text ACTIVELY overflowing right now" without a mutating
 * resize-and-measure round trip, which this walker does not perform).
 * `textTruncation: 'ENDING'` means Figma silently clips this label to an
 * ellipsis whenever the rendered content doesn't fit its box, a
 * landmine for any future content change (a longer label, a
 * localization, a font substitution), which is exactly how a StatusPill
 * shipped rendering "Runnin" instead of "Running" (2026-07, live D02.1
 * build). The fix is never truncation: auto-resize the text or size the
 * box to the content.
 */
export function textTruncationViolation(node: AnyNode): Violation | null {
  if (node.type !== 'TEXT') return null
  if (node.textTruncation !== 'ENDING') return null
  return {
    rule: 'text-truncation',
    detail: 'text node is configured to truncate ("textTruncation: ENDING"), content can silently clip; auto-resize the text or size its box to the content instead'
  }
}

const NAMED_AUDIT_TARGET_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'FRAME', 'SECTION'])

/**
 * Named-component audit matching predicate (figma-audit's hard-gate mode).
 * A named audit must be able to target SCREENS and foundation frames, not
 * only components — those are FRAME/SECTION nodes, which a
 * COMPONENT/COMPONENT_SET-only match silently misses (fix: 2026-07, closed
 * a false-pass where a named audit of a frame returned zero matches instead
 * of walking it).
 */
export function isNamedAuditTarget(node: AnyNode, name: string): boolean {
  return node.name === name && NAMED_AUDIT_TARGET_TYPES.has(node.type)
}

/**
 * Wireframe-page exemption (figma-wireframe/SKILL.md "Wireframe pages are
 * exempt from the tier-0 hard gate"): wireframe surface pages are named
 * `W<NN> <group>` (e.g. `W00 Components`, `W01 Shell & Rail`) per that
 * skill's "Frame naming and layout" section, and the `Cover` page (the
 * design-language legend) is likewise never code-synced. Nodes on a matching
 * page produce zero tier-0 violations at every severity — grayscale
 * unbound fills/strokes there are expected, not a defect.
 */
export function isWireframePageName(name: string): boolean {
  return /^W\d{2}(\b|\s)/.test(name) || name === 'Cover'
}

/**
 * Hi-fi screen page naming (file-structure.md `D<NN> <group>`, mirroring
 * isWireframePageName's `W<NN>` convention). Used to gate the
 * screen-viewport-mismatch check to top-level screen frames only, never
 * component-definition frames on Custom Components.
 */
export function isDesignPageName(name: string): boolean {
  return /^D\d{2}(\b|\s)/.test(name)
}

/**
 * A screen's top-level frame must exactly match the project's canonical
 * viewport (opt-in via `design.<app>.viewport` in .claude/argo.json;
 * skipped entirely when unconfigured, non-breaking for a project that
 * hasn't set it). `isScreenFrame` is marshaled by the walker: true only
 * for the top-level node of a walk whose owning page matches
 * isDesignPageName, never for a descendant, and never for a
 * component-definition frame on Custom Components. Fix (2026-07, live
 * D02.1 build): a screen shipped at 1440x1120 instead of the project's
 * 1440x900 because the designer grew the canvas to fit content instead of
 * fitting content into the canvas.
 */
export function screenViewportMismatchViolation(
  node: AnyNode,
  { isScreenFrame, viewport }: { isScreenFrame: boolean; viewport?: { width: number; height: number } }
): Violation | null {
  if (!isScreenFrame || !viewport) return null
  if (node.width === viewport.width && node.height === viewport.height) return null
  return {
    rule: 'screen-viewport-mismatch',
    detail: `screen frame is ${node.width}x${node.height}, expected ${viewport.width}x${viewport.height} (project canonical viewport)`
  }
}

export function missingAutoLayoutViolation(node: AnyNode): Violation | null {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals structure their own layout — not ours to Auto-Layout.
  if (node.insideInstance) return null
  // INSTANCE nodes are exempt (revised 2026-07-05): an instance's layoutMode
  // mirrors its main component — locally-authored components are already
  // audited at their definition, and kit-library instances (single-vector
  // icon leaves especially) structurally cannot have Auto Layout enabled on
  // the instance. Flagging them forced authors to detach kit instances to
  // pass the gate, losing swap/update propagation.
  if ((node.type === 'FRAME' || node.type === 'COMPONENT') && node.layoutMode === 'NONE') {
    // Absolute-canvas exemption: a frame whose children are ALL absolutely
    // positioned (a deliberate backdrop / orb-scene / overlay layer) gains
    // nothing from Auto Layout — it is a no-op on all-absolute children, so
    // requiring it is rigidity, not hygiene. An empty or non-absolute-child
    // frame is unaffected, so normal stacked content still flags (keeping the
    // D24 gap/padding-token leverage intact).
    const children: AnyNode[] = node.children ?? []
    // Zero-child exemption (StatusDot false positive, 2026-07-07): a leaf
    // shape has nothing to lay out — explicit, not implied via .every()'s
    // vacuous pass, so the intent survives edits to the absolute-canvas check.
    if (children.length === 0) return null
    if (children.every((c) => c?.layoutPositioning === 'ABSOLUTE')) return null
    return { rule: 'missing-auto-layout', detail: 'frame-like node has no Auto Layout' }
  }
  return null
}

export function handDrawnIconViolation(node: AnyNode): Violation | null {
  if (node.type === 'VECTOR' && !node.insideInstance) {
    return {
      rule: 'hand-drawn-icon',
      detail: "raw vector glyph outside any library instance — use the design system's icon components"
    }
  }
  return null
}

/**
 * Kit components are used AS-IS (R10 denylist reframe, 2026-07-05): a
 * DENYLIST of the specific illegal edits a user named, not an allowlist.
 * The allowlist form (`ALLOWED_KIT_INSTANCE_OVERRIDES`) needed emergency
 * same-day growth to add `characters` + `styledTextSegments` — a hard gate's
 * false-positive/false-negative costs are asymmetric (detach-and-edit-icons
 * vs. one visual-review catch), so it fails OPEN: an override outside this
 * list (e.g. `rotation`, `boundVariables`) passes, and only vector geometry,
 * the cornerRadius family, and `effects` hard-fail here.
 *
 * CARVE-OUT (live-file correction, 2026-07-05): `strokeWeight` (and its
 * per-side/join/cap siblings) is deliberately NOT in this denylist. Figma
 * records a proportional icon rescale — the sanctioned fix for the R6/NEW-3
 * stroke-distortion gotcha — as a `strokeWeight` override on the instance;
 * argo-v2's live library carries that override on every correctly-rescaled
 * icon. Denying it unconditionally would hard-fail every correctly-rescaled
 * icon, recreating the exact false-positive disaster R10 exists to prevent.
 * strokeWeight legality is owned solely by `strokeScaleViolation` (NEW-3)'s
 * proportionality check, never this override list.
 *
 * The walker marshals `isRemoteInstance` from getMainComponentAsync().remote
 * and `overriddenFields` from InstanceNode.overrides.
 */
const DENIED_KIT_INSTANCE_OVERRIDE_FIELDS = [
  // geometry
  'vectorPaths',
  'vectorNetwork',
  'relativeTransform',
  // cornerRadius family
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  // effects
  'effects'
]

export function kitInstanceOverrideViolation(node: AnyNode): Violation | null {
  if (node.type !== 'INSTANCE' || !node.isRemoteInstance) return null
  const hit = (node.overriddenFields ?? []).find((f: string) => DENIED_KIT_INSTANCE_OVERRIDE_FIELDS.includes(f))
  if (hit) {
    return {
      rule: 'kit-instance-override',
      detail: `kit instance overrides "${hit}" — geometry/corner-radius/effects edits on kit internals are never legal`
    }
  }
  return null
}

/** node.hasMainComponent is resolved by the walker via node.getMainComponentAsync(). */
export function detachedInstanceViolation(node: AnyNode): Violation | null {
  if (node.type === 'INSTANCE' && !node.hasMainComponent) {
    return { rule: 'detached-instance', detail: 'instance has no resolvable main component' }
  }
  return null
}

export function nonSemanticNameViolation(node: AnyNode): Violation | null {
  // Nodes inside a library instance are exempt (2026-07-05): kit internals
  // carry the kit's own auto-names and are not ours to rename — flagging
  // them made pristine kit instances fail the hard gate.
  if (node.insideInstance) return null
  if (/^(Frame|Group|Rectangle|Ellipse|Text|Vector)\s?\d*$/.test(node.name)) {
    return { rule: 'non-semantic-name', detail: `node name "${node.name}" looks auto-generated, not semantic` }
  }
  return null
}

export function variantNamingViolations(node: AnyNode): Violation[] {
  const violations: Violation[] = []
  if (node.type === 'COMPONENT_SET') {
    for (const propName of Object.keys(node.componentPropertyDefinitions ?? {})) {
      if (propName[0] !== propName[0].toLowerCase()) {
        violations.push({ rule: 'variant-naming', detail: `variant property "${propName}" should be lowercase (D18)` })
      }
    }
  }
  return violations
}

/**
 * Style-hygiene advisory (owner mandate, 2026-07-07): authored copy never
 * carries an em dash. Inspects TEXT.characters only — layer/component names
 * are naming-convention territory (nonSemanticNameViolation), not copy.
 * `—` spelled as an escape so the character can't be silently
 * normalized away by an editor touching this file.
 */
export function emDashViolation(node: AnyNode): Violation | null {
  if (node.type === 'TEXT' && typeof node.characters === 'string' && node.characters.includes('\u2014')) {
    return { rule: 'em-dash-in-text', detail: 'text contains an em dash; use a period, comma, colon, or · instead' }
  }
  return null
}

export function implicitLineHeightViolation(node: AnyNode): Violation | null {
  if ('lineHeight' in node && node.lineHeight?.unit === 'AUTO') {
    return { rule: 'implicit-line-height', detail: 'text node uses implicit AUTO line-height; must be explicit (D20)' }
  }
  return null
}

/** node.storyUrl is resolved by the walker from shared plugin data (namespace 'argo', key 'storyUrl'); private plugin data is a legacy fallback. */
export function storyUrlScopeViolation(node: AnyNode): Violation | null {
  if (node.type === 'COMPONENT' && node.storyUrl && !node.storyUrl.includes('node-id=')) {
    return { rule: 'non-node-scoped-story-url', detail: `storyUrl "${node.storyUrl}" is not node-scoped` }
  }
  return null
}

/**
 * Collection membership is resolved by the walker; this function is pure over
 * the marshaled shape (D24, revised 2026-07-05). The single legal state for a
 * non-zero gap/padding field: bound to a spacing variable in the Primitives or
 * Semantic collection. Unbound literals — on-scale or not — are violations:
 * binding makes off-scale unrepresentable (you can only bind a token that
 * exists) and leaves exactly one authoring convention, so files can't drift
 * into a bound-here-literal-there mix. COMPONENT_SET containers are skipped —
 * their gap/padding is Figma's variant-grid chrome, not a design value.
 */
const STROKE_SCALE_TOLERANCE = 0.15

/**
 * NEW-3 (promoted out of R6/R3, 2026-07-05): flags an icon-like remote
 * instance (a lucide icon — a 24x24 frame wrapping one VECTOR at
 * strokeWeight 2, per the observed live shape) whose resolved strokeWeight
 * doesn't track its rescale ratio — the walker marshals the plain shape
 * `{ instanceSize, nativeSize, resolvedStrokeWeight, baseStrokeWeight }`
 * (icon-like = a remote instance whose main component is a single-VECTOR
 * component). The ratio only holds when the instance was rescaled
 * proportionally (Figma's sanctioned "Scale" tool on the instance); a
 * width/height-only resize leaves the original stroke weight in place,
 * producing a visually chunky/thin glyph (#4). ±15% tolerance absorbs
 * legitimate rounding to a whole-pixel stroke weight.
 */
export function strokeScaleViolation({
  instanceSize,
  nativeSize,
  resolvedStrokeWeight,
  baseStrokeWeight
}: {
  instanceSize: number
  nativeSize: number
  resolvedStrokeWeight: number
  baseStrokeWeight: number
}): Violation | null {
  if (!nativeSize) return null
  const expected = baseStrokeWeight * (instanceSize / nativeSize)
  if (expected === 0) return null
  const ratio = resolvedStrokeWeight / expected
  if (ratio < 1 - STROKE_SCALE_TOLERANCE || ratio > 1 + STROKE_SCALE_TOLERANCE) {
    return {
      rule: 'stroke-scale-mismatch',
      detail: `resolved strokeWeight ${resolvedStrokeWeight} does not track the instance's rescale ratio (expected ~${expected.toFixed(2)}) — the icon was likely resized, not rescaled proportionally`
    }
  }
  return null
}

/**
 * R8 mechanical false-positive discriminator: a violation on a node that
 * resolves to a kit main component (a remote instance, or a node inside
 * one) whose only overrides are size/fill/stroke is presumptively a GATE
 * BUG, not a real hygiene defect — the designer never touched anything else
 * on that node. Tagging is mechanical (never self-graded by the agent
 * reporting it), and does NOT license detaching or editing kit internals
 * (agents/designer.md ICONS section states that loudly).
 */
const POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS = ['width', 'height', 'fills', 'strokes', 'fillStyleId', 'strokeStyleId']

export function possibleGateFalsePositiveTag(node: AnyNode): boolean {
  if (!node.isRemoteInstance && !node.insideInstance) return false
  const overridden = node.overriddenFields ?? []
  if (overridden.length === 0) return false
  return overridden.every((f: string) => POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS.includes(f))
}

/**
 * design-memory-placement.md Mechanism 1: advisory-only reconciliation for a
 * component that isn't a child of any category shelf frame on
 * `Custom Components` — a human manually rearranged it, or an agent placed
 * it directly on the page instead of `appendChild`-ing to the resolved
 * shelf. Never blocks — self-corrects on the next figma-create upsert.
 * `insideCategoryShelf` is marshaled by the walker from the node's parent
 * chain against the configured `componentCategories` shelf frames.
 */
export function unsectionedComponentViolation(node: AnyNode): Violation | null {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return null
  if (node.insideCategoryShelf) return null
  return {
    rule: 'unsectioned-component',
    detail: `component "${node.name}" is not a child of any category shelf frame on Custom Components`
  }
}

/** Mechanism 3 (advisory): a component with no description misses the one place in-file facts (purpose + category) can't drift. Never blocks. */
export function missingComponentDescriptionViolation(node: AnyNode): Violation | null {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return null
  if (node.description) return null
  return {
    rule: 'missing-component-description',
    detail: `component "${node.name}" has no description (purpose + category, one line)`
  }
}

/**
 * Option B (design-first-council-ruling.md Gate ruling, ADVISORY only): in a
 * composed SCREEN, a node named after a known composite (`compositeNames` —
 * the project's registered composite names, e.g. `design/registry.json`
 * entries) that is a plain FRAME rather than an INSTANCE of that component is
 * under-decomposition — a traced screen, not one composed from built
 * components via figma-create's component-first screen path (#4). This is
 * the under-decomposition catch the council promoted to advisory, NOT the
 * hard authoritative decomposition gate (Option C), which is deferred until
 * its brief/story-map schema lands — never wire this as a hard-fail.
 */
export function compositeRegionNamingViolation(node: AnyNode, compositeNames: string[]): Violation | null {
  if (node.type !== 'FRAME') return null
  if (!(compositeNames ?? []).includes(node.name)) return null
  // Wrapper-frame exemption: a FRAME named after a composite that DIRECTLY
  // contains an INSTANCE of that same composite is the legitimate
  // clip/shadow/effect-wrapper idiom (a `Card` frame wrapping a `Card`
  // instance), not a traced replacement. Only a same-named frame with NO such
  // instance inside is under-decomposition.
  const children: AnyNode[] = node.children ?? []
  if (children.some((c) => c?.type === 'INSTANCE' && c?.name === node.name)) return null
  return {
    rule: 'composite-region-traced-not-instance',
    detail: `frame "${node.name}" is named after a composite component but is a plain FRAME, not an INSTANCE — looks traced, not composed`
  }
}

export type GapPaddingCollectionsConfig = {
  /** Project-configured Semantic collection name (`argo.json`'s `semanticCollectionName`); defaults to the literal `'Semantic'` for a project with no config. */
  semanticCollectionName?: string
  /** Project-configured Primitives collection name; defaults to the literal `'Primitives'` for a project with no config. */
  primitivesCollectionName?: string
  /**
   * Recipe-declared allowlist of additional collection names a spacing
   * binding may legally resolve to (e.g. shadcn-tailwind's `tw/gap`,
   * `tw/padding`, `tw/margin`, `tw/space` family — a stock kit duplicate
   * deliberately splits spacing tokens across these instead of a single
   * Primitives/Semantic collection). Empty for a recipe that declares none.
   */
  additionalAllowedCollectionNames?: string[]
}

/**
 * Live field bug (2026-07-07, first migration run): this check used to
 * hardcode the literal collection names `"Primitives"`/`"Semantic"` — a
 * stock kit duplicate that never renamed its Semantic collection (named
 * `mode`) and splits spacing tokens across a `tw/*` collection family failed
 * this check on every one of its own untouched components. No collection-
 * name literals here now — every accepted name is configured/declared by the
 * caller.
 */
export function gapPaddingSpacingViolations(node: AnyNode, config: GapPaddingCollectionsConfig = {}): Violation[] {
  const { semanticCollectionName = 'Semantic', primitivesCollectionName = 'Primitives', additionalAllowedCollectionNames = [] } = config
  const acceptedCollections = new Set([semanticCollectionName, primitivesCollectionName, ...additionalAllowedCollectionNames])
  // Nodes inside a library instance are exempt (2026-07-05): kit internals
  // bind the kit's own spacing collections (e.g. tw/gap) — not ours to
  // rebind; flagging them made pristine kit instances fail the hard gate.
  if (node.insideInstance) return []
  // INSTANCE nodes' own gap/padding mirrors their component definition —
  // locally-authored components are audited at the definition; kit instances'
  // boundary nodes carry the kit's own bindings (tw/gap observed live).
  if (node.layoutMode === 'NONE' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE')
    return []
  const violations: Violation[] = []
  for (const entry of node.gapAndPadding ?? []) {
    const { field, value, bound, collectionName } = entry
    if (!bound) {
      if (value !== 0) {
        violations.push({
          rule: 'gap-padding-unbound',
          detail: `${field} value ${value} is an unbound literal; D24 requires binding a ${primitivesCollectionName} or ${semanticCollectionName} spacing variable`
        })
      }
    } else if (!acceptedCollections.has(collectionName)) {
      violations.push({
        rule: 'gap-padding-foreign-binding',
        detail: `${field} is bound to a variable outside the project collections ("${collectionName}"); D24 requires a ${primitivesCollectionName} or ${semanticCollectionName} spacing variable`
      })
    }
  }
  return violations
}
