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
import { wcagContrastViolation } from './contrast.js'

export type GeometryViolation = { rule: string; detail: string; nodeId?: string }

export type RowCluster = { x: number; rows: any[] }

/**
 * Groups rows by their own #content-start x — the row's rendered indent
 * IS its depth signal (geometry-row-model-fix.md: no DOM-nesting inference,
 * no separate depth tag, no component-specific variant read; the earlier
 * DOM-nesting model false-fired 40× on a real flat instance-list tree). A
 * row within tolerancePx of a cluster's anchor x (the first row assigned to
 * it) joins that cluster; anything further starts a new one. Clusters are
 * returned sorted ascending by x, so cluster[0] is the shallowest depth.
 * A row with no #content-start descendant is skipped (missing-role-tags'
 * job to flag total absence, not this function's).
 */
export function clusterRowsByContentStartX(rows: any[], tolerancePx: number): RowCluster[] {
  const withStart = rows
    .map((row) => ({ row, x: findAllByRole(row, 'content-start')[0]?.x }))
    .filter((r): r is { row: any; x: number } => typeof r.x === 'number')
    .sort((a, b) => a.x - b.x)
  const clusters: RowCluster[] = []
  for (const { row, x } of withStart) {
    const current = clusters[clusters.length - 1]
    if (current && x - current.x <= tolerancePx) {
      current.rows.push(row)
    } else {
      clusters.push({ x, rows: [row] })
    }
  }
  return clusters
}

/**
 * Every row WITHIN one x-cluster (same declared depth, see
 * clusterRowsByContentStartX) must place its own #content-start at the
 * cluster's baseline x. By construction, clusterRowsByContentStartX only
 * ever assigns a row to a cluster it's already within tolerance of — so
 * fed pipeline-produced clusters this is a defense-in-depth invariant on the
 * clustering guarantee, not dead code: it is independently meaningful and
 * independently tested against hand-built clusters that violate the
 * invariant directly (geometry-row-model-fix.md, Known Limitation). A
 * conditional leading element that shifts a row's content instead lands it
 * in its own singleton cluster, caught by indentStepUniformityViolations.
 */
export function contentStartAlignmentViolations(clusters: RowCluster[], tolerancePx: number): GeometryViolation[] {
  const violations: GeometryViolation[] = []
  for (const cluster of clusters) {
    if (cluster.rows.length < 2) continue
    for (const row of cluster.rows) {
      const node = findAllByRole(row, 'content-start')[0]
      if (node && Math.abs(node.x - cluster.x) > tolerancePx) {
        violations.push({
          rule: 'content-start-misaligned',
          nodeId: node.id,
          detail: `row "${row.name}"'s #content-start is at x=${node.x}, expected x=${cluster.x} (matching its depth cluster) — a conditional leading element likely shifted this row's content`
        })
      }
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
 * Distinct content-start-x cluster values, sorted ascending, must be evenly
 * spaced by ONE indent unit — derived from the first two clusters' delta,
 * never hardcoded (a project's indent unit is whatever its rows actually
 * render at). Needs at least 3 clusters (2 deltas) to have anything to
 * compare; row-height uniformity is deliberately NOT checked here (dropped
 * per geometry-row-model-fix.md — kind-varying row height, e.g. 28px phase
 * vs 36px agent rows, is legitimate).
 */
export function indentStepUniformityViolations(clusters: RowCluster[], tolerancePx: number): GeometryViolation[] {
  if (clusters.length < 3) return []
  const sorted = [...clusters].sort((a, b) => a.x - b.x)
  const unit = sorted[1].x - sorted[0].x
  const violations: GeometryViolation[] = []
  for (let i = 2; i < sorted.length; i++) {
    const delta = sorted[i].x - sorted[i - 1].x
    if (Math.abs(delta - unit) > tolerancePx) {
      const citedRow = sorted[i].rows[0]
      violations.push({
        rule: 'indent-step-inconsistent',
        nodeId: citedRow?.id,
        detail: `indent step from x=${sorted[i - 1].x} to x=${sorted[i].x} is ${delta}px, expected ${unit}px (matching the first indent step)`
      })
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

/**
 * A HUG-sized axis whose own children's combined box exceeds the node's
 * OWN rendered width/height is the combineAsVariants-freeze symptom
 * figma-create's step 4 flagged as untestable without live measurement —
 * but the walker already reads POST-LAYOUT absoluteBoundingBox, i.e. real
 * rendered geometry, not intent, so this is a plain comparison.
 */
export function hugOverflowViolations(node: any): GeometryViolation[] {
  const violations: GeometryViolation[] = []
  for (const child of node.children ?? []) {
    if (node.layoutSizingHorizontal === 'HUG' && child.x + child.width > node.x + node.width) {
      violations.push({ rule: 'hug-overflow-horizontal', nodeId: node.id, detail: `"${node.name}" is HUG-horizontal but child "${child.name}" extends past its right edge` })
    }
    if (node.layoutSizingVertical === 'HUG' && child.y + child.height > node.y + node.height) {
      violations.push({ rule: 'hug-overflow-vertical', nodeId: node.id, detail: `"${node.name}" is HUG-vertical but child "${child.name}" extends past its bottom edge` })
    }
  }
  return violations
}

const MIN_TOUCH_TARGET_PX = 24 // configurable — see prepare-tier0-audit-options wiring

/** Scopes to nodes carrying the opt-in #hit-target role tag (resolved decision 3). */
export function touchTargetViolation(node: any, minPx: number = MIN_TOUCH_TARGET_PX): GeometryViolation | null {
  if (node.width >= minPx && node.height >= minPx) return null
  return { rule: 'touch-target-too-small', nodeId: node.id, detail: `#hit-target "${node.name}" is ${node.width}x${node.height}, below the ${minPx}x${minPx}px minimum` }
}

/** First visible SOLID fill's color, converted from Figma's 0-1 range to 0-255 — null when unresolvable (no fills, no SOLID fill, or hidden). */
function solidFillColor(fills: any): { r: number; g: number; b: number } | null {
  if (!Array.isArray(fills)) return null
  const solid = fills.find((f: any) => f?.type === 'SOLID' && f?.visible !== false)
  if (!solid?.color) return null
  return { r: Math.round(solid.color.r * 255), g: Math.round(solid.color.g * 255), b: Math.round(solid.color.b * 255) }
}

/**
 * WCAG contrast check, scoped to #hit-target-tagged TEXT nodes (resolved
 * decision 3: contrast/touch-target opt in via #hit-target, unlike
 * HUG-overflow which auto-applies structurally). Foreground = the tagged
 * node's own resolved SOLID fill; background = the nearest ancestor
 * carrying a resolvable SOLID fill — the walker already marshals `fills`
 * on every node (marshalGeometryTree), no live-measurement round trip
 * needed. Fails open (never a crash, never a false violation) on a
 * non-TEXT node, a node with no resolvable SOLID fill, or no ancestor with
 * one — same R10 asymmetric-cost economics as every other tier-0 hard
 * gate: a layered/gradient background this walker can't resolve is a
 * silent skip, not a guess. Large-text carve-out uses `fontSize >= 18`
 * only — the bold-at-14pt WCAG exception is deliberately not applied here:
 * a plain marshaled TEXT node has no grounded numeric font-weight field in
 * this walker's shape (`fontName.style` is a free-text string, not a
 * reliable weight signal), and erring toward the stricter 4.5:1 threshold
 * for a bold 14pt label is the safe direction for a hard gate (a spurious
 * extra scrutiny, never a missed real defect).
 */
export function wcagContrastCheckViolation(node: any, ancestors: any[]): GeometryViolation | null {
  if (node.type !== 'TEXT') return null
  const fg = solidFillColor(node.fills)
  if (!fg) return null
  const bgNode = [...ancestors].reverse().find((a) => solidFillColor(a.fills))
  if (!bgNode) return null
  const bg = solidFillColor(bgNode.fills)!
  const isLargeText = typeof node.fontSize === 'number' && node.fontSize >= 18
  const violation = wcagContrastViolation(fg, bg, isLargeText)
  if (!violation) return null
  return { rule: violation.rule, nodeId: node.id, detail: violation.detail }
}

/**
 * Per-target opt-in gate (fixes the whole-call boolean bug, 2026-07-08 merge
 * review): `geometryCategories` is the project's FIXED enum of categories
 * that structurally have rows (list/tree/table/nav) — whether THIS ONE
 * audited target's own resolved category is a member of it, never whether
 * `geometryCategories` is merely non-empty SOMEWHERE in the call. A target
 * with no resolved category at all (`category` undefined/null) fails
 * closed — never guesses a category to make the check run.
 */
export function isGeometryCheckedCategory(category: string | null | undefined, geometryCategories: string[]): boolean {
  return typeof category === 'string' && category.length > 0 && geometryCategories.includes(category)
}

/**
 * The actual per-target dispatch the bug fix wires into `runTier0Audit`'s
 * named-audit loops (`tier0-audit.ts`): a target whose own category isn't a
 * geometry-checked category produces ZERO geometry violations — including
 * `missing-role-tags` — no matter how the marshaled tree is shaped (a plain
 * Button/Badge/Tooltip is never expected to carry `#content-start`/`#rail`/
 * `#anchor` tags, so it must never be judged against that expectation).
 * `composeChecks` is the real `composeGeometryChecks(...)` closure from
 * `tier0-audit.ts`, injected by the caller (this module must not import
 * that one — it's the other direction of the dependency).
 */
export function geometryViolationsForTarget(
  root: any,
  category: string | null | undefined,
  geometryCategories: string[],
  composeChecks: (root: any) => any[]
): any[] {
  if (!isGeometryCheckedCategory(category, geometryCategories)) return []
  return composeChecks(root)
}
