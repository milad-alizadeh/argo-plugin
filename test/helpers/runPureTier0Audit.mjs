/**
 * TEST HELPER, not production code (R7 fixture suite): a pure re-implementation
 * of `templates/design/tier0-audit.js`'s walk/auditNode glue, over already-
 * fully-marshaled plain node trees (no `figma.*` calls) — so the R7 corpus can
 * exercise the SAME pure rule functions the real Plugin-API walker calls,
 * without a live Figma session. Every node shape here mirrors the marshaled
 * shape the real walker produces (see tier0-audit.js's own marshaling
 * comments) — this file must stay in lock-step with which rules the real
 * walker runs and in what order, but never re-implements rule LOGIC itself
 * (that stays exclusively in packages/figma-design-kit/tier0-rules.js).
 */
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
  strokeScaleViolation,
  textTruncationViolation,
  unclippedOverflowViolations
} from '../../packages/kit/src/design-kit/tier0-rules.js'

export function auditPureNode(node) {
  const violations = []
  const report = (rule, detail) => violations.push({ rule, detail, nodeId: node.id, nodeName: node.name })

  for (const v of unboundFillViolations(node)) report(v.rule, v.detail)
  for (const v of unboundStrokeViolations(node)) report(v.rule, v.detail)

  const radius = unboundRadiusViolation(node)
  if (radius) report(radius.rule, radius.detail)

  const type = unboundTypeViolation(node)
  if (type) report(type.rule, type.detail)

  const truncation = textTruncationViolation(node)
  if (truncation) report(truncation.rule, truncation.detail)

  const autoLayout = missingAutoLayoutViolation(node)
  if (autoLayout) report(autoLayout.rule, autoLayout.detail)

  const handDrawnIcon = handDrawnIconViolation(node)
  if (handDrawnIcon) report(handDrawnIcon.rule, handDrawnIcon.detail)

  if (node.gapAndPadding) {
    for (const v of gapPaddingSpacingViolations(node)) report(v.rule, v.detail)
  }

  if (node.type === 'INSTANCE') {
    const detached = detachedInstanceViolation(node)
    if (detached) report(detached.rule, detached.detail)

    const kitOverride = kitInstanceOverrideViolation(node)
    if (kitOverride) report(kitOverride.rule, kitOverride.detail)

    if (node.iconStrokeScale) {
      const strokeScale = strokeScaleViolation(node.iconStrokeScale)
      if (strokeScale) report(strokeScale.rule, strokeScale.detail)
    }
  }

  const nonSemanticName = nonSemanticNameViolation(node)
  if (nonSemanticName) report(nonSemanticName.rule, nonSemanticName.detail)

  for (const v of variantNamingViolations(node)) report(v.rule, v.detail)

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  const emDash = emDashViolation(node)
  if (emDash) report(emDash.rule, emDash.detail)

  for (const overflow of unclippedOverflowViolations(node)) report(overflow.rule, overflow.detail)

  if (node.type === 'COMPONENT' && node.storyUrl) {
    const storyScope = storyUrlScopeViolation(node)
    if (storyScope) report(storyScope.rule, storyScope.detail)
  }

  return violations
}

/** Walks a forest of already-marshaled plain node trees, same rule set as the real walker. */
export function runPureTier0Audit(nodes) {
  const violations = []
  const walk = (node) => {
    violations.push(...auditPureNode(node))
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of nodes) walk(node)
  return violations
}
