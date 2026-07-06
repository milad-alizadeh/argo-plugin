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
 */

export function unboundFillViolations(node) {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own color collections — not ours to
  // rebind; flagging them made a pristine kit instance (e.g. Switch) fail
  // the hard gate on its own internal frames.
  if (node.insideInstance) return []
  const violations = []
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && !fill.boundVariables?.color) {
        violations.push({ rule: 'unbound-fill', detail: 'solid fill has no bound color variable' })
      }
    }
  }
  return violations
}

export function unboundStrokeViolations(node) {
  // Nodes inside a library instance are exempt (2026-07-05, live D01 build):
  // kit internals bind the kit's own color collections — not ours to
  // rebind; see unboundFillViolations for the same reasoning.
  if (node.insideInstance) return []
  const violations = []
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
export function unboundRadiusViolation(node) {
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
export function unboundTypeViolation(node) {
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

const NAMED_AUDIT_TARGET_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'FRAME', 'SECTION'])

/**
 * Named-component audit matching predicate (figma-audit's hard-gate mode).
 * A named audit must be able to target SCREENS and foundation frames, not
 * only components — those are FRAME/SECTION nodes, which a
 * COMPONENT/COMPONENT_SET-only match silently misses (fix: 2026-07, closed
 * a false-pass where a named audit of a frame returned zero matches instead
 * of walking it).
 */
export function isNamedAuditTarget(node, name) {
  return node.name === name && NAMED_AUDIT_TARGET_TYPES.has(node.type)
}

export function missingAutoLayoutViolation(node) {
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
    return { rule: 'missing-auto-layout', detail: 'frame-like node has no Auto Layout' }
  }
  return null
}

export function handDrawnIconViolation(node) {
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

export function kitInstanceOverrideViolation(node) {
  if (node.type !== 'INSTANCE' || !node.isRemoteInstance) return null
  const hit = (node.overriddenFields ?? []).find((f) => DENIED_KIT_INSTANCE_OVERRIDE_FIELDS.includes(f))
  if (hit) {
    return {
      rule: 'kit-instance-override',
      detail: `kit instance overrides "${hit}" — geometry/corner-radius/effects edits on kit internals are never legal`
    }
  }
  return null
}

/** node.hasMainComponent is resolved by the walker via node.getMainComponentAsync(). */
export function detachedInstanceViolation(node) {
  if (node.type === 'INSTANCE' && !node.hasMainComponent) {
    return { rule: 'detached-instance', detail: 'instance has no resolvable main component' }
  }
  return null
}

export function nonSemanticNameViolation(node) {
  // Nodes inside a library instance are exempt (2026-07-05): kit internals
  // carry the kit's own auto-names and are not ours to rename — flagging
  // them made pristine kit instances fail the hard gate.
  if (node.insideInstance) return null
  if (/^(Frame|Group|Rectangle|Ellipse|Text|Vector)\s?\d*$/.test(node.name)) {
    return { rule: 'non-semantic-name', detail: `node name "${node.name}" looks auto-generated, not semantic` }
  }
  return null
}

export function variantNamingViolations(node) {
  const violations = []
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
 * D11 (generalized to mode copies, 2026-07-05): one visible instance copy per
 * mode of the project Semantic collection BEYOND the default mode (the
 * component itself renders in the default mode). `modes` is the Semantic
 * collection's ordered mode-name list; `modes[0]` is the default and is
 * skipped. A single-mode collection yields `modes.length === 1`, so this
 * returns `[]` vacuously — a dark-only project has zero copies to maintain.
 * node.siblings is resolved by the walker from node.parent.children (excluding
 * node itself).
 */
export function modeCopyViolations(node, semanticCollectionName, modes) {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return []
  const violations = []
  for (const mode of (modes ?? []).slice(1)) {
    const copy = (node.siblings ?? []).find((sibling) => sibling.name === `${node.name} (${mode})`)
    if (!copy) {
      violations.push({ rule: 'missing-mode-copy', detail: `component has no adjacent "${mode}" mode instance copy (D11)` })
      continue
    }
    if (copy.explicitVariableModes?.[semanticCollectionName] == null) {
      violations.push({ rule: 'incorrect-mode-copy', detail: `"${mode}" mode copy does not set the Semantic collection mode explicitly` })
    }
  }
  return violations
}

export function implicitLineHeightViolation(node) {
  if ('lineHeight' in node && node.lineHeight?.unit === 'AUTO') {
    return { rule: 'implicit-line-height', detail: 'text node uses implicit AUTO line-height; must be explicit (D20)' }
  }
  return null
}

/** node.storyUrl is resolved by the walker from shared plugin data (namespace 'argo', key 'storyUrl'); private plugin data is a legacy fallback. */
export function storyUrlScopeViolation(node) {
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
export function strokeScaleViolation({ instanceSize, nativeSize, resolvedStrokeWeight, baseStrokeWeight }) {
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

export function possibleGateFalsePositiveTag(node) {
  if (!node.isRemoteInstance && !node.insideInstance) return false
  const overridden = node.overriddenFields ?? []
  if (overridden.length === 0) return false
  return overridden.every((f) => POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS.includes(f))
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
export function unsectionedComponentViolation(node) {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return null
  if (node.insideCategoryShelf) return null
  return {
    rule: 'unsectioned-component',
    detail: `component "${node.name}" is not a child of any category shelf frame on Custom Components`
  }
}

/** Mechanism 3 (advisory): a component with no description misses the one place in-file facts (purpose + category) can't drift. Never blocks. */
export function missingComponentDescriptionViolation(node) {
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
export function compositeRegionNamingViolation(node, compositeNames) {
  if (node.type !== 'FRAME') return null
  if (!(compositeNames ?? []).includes(node.name)) return null
  return {
    rule: 'composite-region-traced-not-instance',
    detail: `frame "${node.name}" is named after a composite component but is a plain FRAME, not an INSTANCE — looks traced, not composed`
  }
}

export function gapPaddingSpacingViolations(node, _spacingScale) {
  // Nodes inside a library instance are exempt (2026-07-05): kit internals
  // bind the kit's own spacing collections (e.g. tw/gap) — not ours to
  // rebind; flagging them made pristine kit instances fail the hard gate.
  if (node.insideInstance) return []
  // INSTANCE nodes' own gap/padding mirrors their component definition —
  // locally-authored components are audited at the definition; kit instances'
  // boundary nodes carry the kit's own bindings (tw/gap observed live).
  if (node.layoutMode === 'NONE' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE')
    return []
  const violations = []
  for (const entry of node.gapAndPadding ?? []) {
    const { field, value, bound, collectionName } = entry
    if (!bound) {
      if (value !== 0) {
        violations.push({
          rule: 'gap-padding-unbound',
          detail: `${field} value ${value} is an unbound literal; D24 requires binding a Primitives or Semantic spacing variable`
        })
      }
    } else if (collectionName !== 'Semantic' && collectionName !== 'Primitives') {
      violations.push({
        rule: 'gap-padding-foreign-binding',
        detail: `${field} is bound to a variable outside the project collections ("${collectionName}"); D24 requires a Primitives or Semantic spacing variable`
      })
    }
  }
  return violations
}
