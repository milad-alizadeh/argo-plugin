/**
 * TEST HELPER, not production code (R7-style geometry corpus,
 * fidelity-geometry-verifier.md Slice 9): a pure re-implementation of
 * `tier0-audit.ts`'s `composeGeometryChecks` closure, over an already-
 * fully-marshaled plain tree (the same shape `marshalGeometryTree` produces)
 * — so the geometry corpus can exercise the SAME pure rule functions the
 * real Plugin-API walker calls, without a live Figma session. Must stay in
 * lock-step with `composeGeometryChecks`'s rule set and calling order, but
 * never re-implements rule LOGIC itself (that stays exclusively in
 * packages/kit/src/design-kit/geometry-rules.js and tier0-rules.js).
 */
import { missingRoleTagsViolation } from '../../packages/kit/src/design-kit/tier0-rules.js'
import { roleTagOf } from '../../packages/kit/src/design-kit/role-tags.js'
import {
  contentStartAlignmentViolations,
  railAnchorSpanViolation,
  interRowContinuityViolations,
  indentAndRowConsistencyViolations,
  loadBearingVisibilityViolations,
  crossAxisAnchorOffsetViolations,
  hugOverflowViolations,
  touchTargetViolation,
  wcagContrastCheckViolation
} from '../../packages/kit/src/design-kit/geometry-rules.js'

/** Mirrors tier0-audit.ts's marshalRowGroups. */
function marshalRowGroups(tree) {
  return (tree.children ?? []).filter((c) => (c.children ?? []).length > 0)
}

/** Mirrors tier0-audit.ts's groupRowsByDepth. */
function groupRowsByDepth(tree) {
  const byDepth = new Map()
  const walk = (node, depth) => {
    const rows = marshalRowGroups(node)
    if (rows.length > 0) byDepth.set(depth, [...(byDepth.get(depth) ?? []), ...rows])
    for (const row of rows) walk(row, depth + 1)
  }
  walk(tree, 0)
  return byDepth
}

/** Mirrors tier0-audit.ts's collectRoleTaggedWithAncestors. */
function collectRoleTaggedWithAncestors(tree) {
  const out = []
  const walk = (node, ancestors) => {
    if (roleTagOf(node) !== null) out.push({ node, ancestors })
    for (const child of node.children ?? []) walk(child, [...ancestors, node])
  }
  walk(tree, [])
  return out
}

/** Mirrors tier0-audit.ts's composeGeometryChecks, tolerancePx fixed at 1 for the corpus (the project default). */
export function runPureGeometryAudit(root, tolerancePx = 1) {
  const violations = []
  const report = (v) => {
    if (!v) return
    violations.push({ rule: v.rule, nodeId: v.nodeId ?? root.id, detail: v.detail })
  }

  report(missingRoleTagsViolation(root, { requiresRoleTags: true }))

  const rows = marshalRowGroups(root)
  for (const v of contentStartAlignmentViolations(rows, tolerancePx)) report(v)
  report(railAnchorSpanViolation(root, rows, tolerancePx))
  const itemSpacing = typeof root.itemSpacing === 'number' ? root.itemSpacing : 0
  for (const v of interRowContinuityViolations(rows, itemSpacing, tolerancePx)) report(v)
  for (const v of indentAndRowConsistencyViolations(groupRowsByDepth(root), tolerancePx)) report(v)
  const roleTagged = collectRoleTaggedWithAncestors(root)
  for (const v of loadBearingVisibilityViolations(roleTagged)) report(v)
  for (const v of crossAxisAnchorOffsetViolations(rows, tolerancePx)) report(v)
  for (const containerLikeNode of [root, ...rows]) {
    for (const v of hugOverflowViolations(containerLikeNode)) report(v)
  }
  const hitTargets = roleTagged.filter((rt) => roleTagOf(rt.node) === 'hit-target')
  for (const { node: hitTarget } of hitTargets) report(touchTargetViolation(hitTarget))
  for (const { node: hitTarget, ancestors } of hitTargets) report(wcagContrastCheckViolation(hitTarget, ancestors))

  return violations
}
