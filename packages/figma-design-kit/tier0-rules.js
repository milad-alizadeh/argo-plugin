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
 * node types) — fix: 2026-07, closed a 71-hit false-positive class.
 */
export function unboundRadiusViolation(node) {
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
  if ((node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') && node.layoutMode === 'NONE') {
    return { rule: 'missing-auto-layout', detail: 'frame-like node has no Auto Layout' }
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

/** node.storyUrl is resolved by the walker from node.getPluginData('storyUrl'). */
export function storyUrlScopeViolation(node) {
  if (node.type === 'COMPONENT' && node.storyUrl && !node.storyUrl.includes('node-id=')) {
    return { rule: 'non-node-scoped-story-url', detail: `storyUrl "${node.storyUrl}" is not node-scoped` }
  }
  return null
}

/**
 * spacingScale values and collection membership are resolved by the walker;
 * this function is pure over the marshaled shape (D24). Legal states for a
 * gap/padding field: bound to a Semantic spacing variable, or an unbound
 * literal that is a member of the Primitives spacing scale. A direct binding
 * to a Primitives variable is not legal — D24 names only the two cases above.
 */
export function gapPaddingSpacingViolations(node, spacingScale) {
  if (node.layoutMode === 'NONE') return []
  const violations = []
  for (const entry of node.gapAndPadding ?? []) {
    const { field, value, bound, collectionName } = entry
    if (bound) {
      if (collectionName !== 'Semantic') {
        violations.push({
          rule: 'gap-padding-non-semantic-binding',
          detail: `${field} is bound to a non-Semantic variable ("${collectionName}"); D24 requires a Semantic spacing variable or an on-scale literal`
        })
      }
    } else if (!spacingScale.includes(value)) {
      violations.push({
        rule: 'gap-padding-off-scale',
        detail: `${field} value ${value} is not on the Primitives spacing scale and is not bound to a Semantic spacing variable (D24)`
      })
    }
  }
  return violations
}
