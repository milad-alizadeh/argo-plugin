/**
 * Layer A geometry checks (fidelity-geometry-verifier.md Part 1): pure
 * predicate functions over an already-marshaled subtree (`marshalGeometryTree`
 * in tier0-audit.ts), same unit-test contract as tier0-rules.ts. A geometry
 * rule is inherently cross-sibling/cross-row — sibling-alignment/rail-span
 * checks structurally cannot be expressed as a per-node predicate the way
 * every tier0-rules.ts function is — so these functions take a whole
 * resolved subtree/row-group (marshaled once per named-audit root by the
 * caller), not a stream of individual node calls.
 */
import { findAllByRole } from './role-tags.js'

export type GeometryViolation = { rule: string; detail: string; nodeId?: string }

/**
 * Every sibling row at the same depth under `rows` (already-resolved by the
 * caller — see marshalRowGroups in tier0-audit.ts) must place its
 * #content-start descendant at the SAME absolute x. A conditional leading
 * icon that shifts one row's content relative to its siblings is exactly
 * what this catches — collapses the task's two separate bullets ("sibling
 * content-start x alignment" and "fixed-slot invariant for conditional
 * leading elements") into one predicate, they reduce to the same check.
 */
export function contentStartAlignmentViolations(rows: any[], tolerancePx: number): GeometryViolation[] {
  const starts = rows
    .map((row) => ({ row, node: findAllByRole(row, 'content-start')[0] }))
    .filter((r) => r.node)
  if (starts.length < 2) return []
  const baseline = starts[0].node.x
  const violations: GeometryViolation[] = []
  for (const { row, node } of starts.slice(1)) {
    if (Math.abs(node.x - baseline) > tolerancePx) {
      violations.push({
        rule: 'content-start-misaligned',
        nodeId: node.id,
        detail: `row "${row.name}"'s #content-start is at x=${node.x}, expected x=${baseline} (matching its first sibling) — a conditional leading element likely shifted this row's content`
      })
    }
  }
  return violations
}

/**
 * A tree's connector rail (#rail) must span from the tree ROOT's own
 * #anchor y-center to the LAST child row's #anchor y-center — two-sided:
 * catches both overshoot (rail runs past the last item) and undershoot
 * (rail stops short of it). y-center, not y, because a rail visually
 * connects dot-centers, not box tops.
 */
export function railAnchorSpanViolation(tree: any, rows: any[], tolerancePx: number): GeometryViolation | null {
  const rail = findAllByRole(tree, 'rail')[0]
  const rootAnchor = findAllByRole(tree, 'anchor').find((a) => !rows.some((r) => findAllByRole(r, 'anchor').includes(a)))
  const lastRow = rows[rows.length - 1]
  const lastAnchor = lastRow ? findAllByRole(lastRow, 'anchor')[0] : null
  if (!rail || !rootAnchor || !lastAnchor) return null
  const expectedStart = rootAnchor.y + rootAnchor.height / 2
  const expectedEnd = lastAnchor.y + lastAnchor.height / 2
  const actualStart = rail.y
  const actualEnd = rail.y + rail.height
  if (Math.abs(actualStart - expectedStart) <= tolerancePx && Math.abs(actualEnd - expectedEnd) <= tolerancePx) return null
  return {
    rule: 'rail-anchor-span-mismatch',
    nodeId: rail.id,
    detail: `rail spans y=${actualStart}..${actualEnd}, expected y=${expectedStart}..${expectedEnd} (parent anchor to last-child anchor center) — overshoot or undershoot`
  }
}
