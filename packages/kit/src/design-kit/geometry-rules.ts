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

/**
 * No vertical gap between consecutive rows' own bounding boxes beyond
 * itemSpacing + tolerancePx — a real rendered gap larger than the row
 * container's own configured gap means the rail visually breaks.
 */
export function interRowContinuityViolations(rows: any[], itemSpacing: number, tolerancePx: number): GeometryViolation[] {
  const violations: GeometryViolation[] = []
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].y - (rows[i - 1].y + rows[i - 1].height)
    if (gap > itemSpacing + tolerancePx) {
      violations.push({
        rule: 'rail-continuity-gap',
        nodeId: rows[i].id,
        detail: `gap of ${gap}px between row "${rows[i - 1].name}" and "${rows[i].name}" exceeds the configured itemSpacing (${itemSpacing}px) + tolerance`
      })
    }
  }
  return violations
}

/**
 * Every row at the same tree DEPTH must share one x-offset delta from its
 * parent depth (indent step), and rows at any one depth must share one
 * height and one itemSpacing — computed from the marshaled rows, no
 * hardcoded step value (a project's indent unit is whatever its rows
 * actually render at).
 */
export function indentAndRowConsistencyViolations(rowsByDepth: Map<number, any[]>, tolerancePx: number): GeometryViolation[] {
  const violations: GeometryViolation[] = []
  for (const [depth, rows] of rowsByDepth) {
    if (rows.length < 2) continue
    const baselineX = rows[0].x
    const baselineHeight = rows[0].height
    for (const row of rows.slice(1)) {
      if (Math.abs(row.x - baselineX) > tolerancePx) {
        violations.push({ rule: 'indent-inconsistent', nodeId: row.id, detail: `depth ${depth} row "${row.name}" is indented to x=${row.x}, expected x=${baselineX} (matching its depth siblings)` })
      }
      if (Math.abs(row.height - baselineHeight) > tolerancePx) {
        violations.push({ rule: 'row-height-inconsistent', nodeId: row.id, detail: `depth ${depth} row "${row.name}" has height ${row.height}, expected ${baselineHeight}` })
      }
    }
  }
  return violations
}

/**
 * A role-tagged (load-bearing) node with correct coordinates but
 * invisible/zero-opacity/ancestor-clipped is a pass-the-coordinate-check
 * cheat — flag it explicitly rather than trusting geometry alone. Walks
 * the ancestor chain the caller supplies (tier0-audit.ts's marshal keeps
 * a parent pointer — see collectRoleTaggedWithAncestors) for opacity
 * compounding and clip-boundary containment.
 */
export function loadBearingVisibilityViolations(taggedNodes: { node: any; ancestors: any[] }[]): GeometryViolation[] {
  const violations: GeometryViolation[] = []
  for (const { node, ancestors } of taggedNodes) {
    if (node.visible === false) {
      violations.push({ rule: 'load-bearing-node-hidden', nodeId: node.id, detail: `"${node.name}" is role-tagged but visible === false` })
      continue
    }
    const effectiveOpacity = [node, ...ancestors].reduce((acc, n) => acc * (typeof n.opacity === 'number' ? n.opacity : 1), 1)
    if (effectiveOpacity <= 0) {
      violations.push({ rule: 'load-bearing-node-transparent', nodeId: node.id, detail: `"${node.name}" resolves to effective opacity ${effectiveOpacity}` })
      continue
    }
    const clipper = ancestors.find((a) => a.clipsContent === true)
    if (clipper) {
      const outOfBounds = node.x < clipper.x || node.y < clipper.y || node.x + node.width > clipper.x + clipper.width || node.y + node.height > clipper.y + clipper.height
      if (outOfBounds) {
        violations.push({ rule: 'load-bearing-node-clipped', nodeId: node.id, detail: `"${node.name}" falls outside its clipping ancestor "${clipper.name}"'s bounds` })
      }
    }
  }
  return violations
}

/**
 * Every sibling row's #anchor must sit at the SAME y-offset RELATIVE to
 * its own row's top (not absolute y — rows are at different absolute y
 * by definition) — catches an anchor dot that's vertically off-center in
 * one row but not its siblings.
 */
export function crossAxisAnchorOffsetViolations(rows: any[], tolerancePx: number): GeometryViolation[] {
  const offsets = rows
    .map((row) => {
      const anchor = findAllByRole(row, 'anchor')[0]
      return anchor ? { row, offset: anchor.y - row.y, anchor } : null
    })
    .filter(Boolean) as { row: any; offset: number; anchor: any }[]
  if (offsets.length < 2) return []
  const baseline = offsets[0].offset
  const violations: GeometryViolation[] = []
  for (const { row, offset, anchor } of offsets.slice(1)) {
    if (Math.abs(offset - baseline) > tolerancePx) {
      violations.push({
        rule: 'anchor-cross-axis-offset',
        nodeId: anchor.id,
        detail: `row "${row.name}"'s #anchor sits ${offset}px from its row top, expected ${baseline}px (matching its siblings)`
      })
    }
  }
  return violations
}
