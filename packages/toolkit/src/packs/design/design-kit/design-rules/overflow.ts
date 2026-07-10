import type { AnyNode, Violation } from './types.js'

/**
 * Advisory. Flags a child whose absoluteBoundingBox extends past its
 * parent's while the parent has clipsContent disabled — e.g. a
 * progress-segment row overflowing its card's right edge can ship past
 * every other gate this way. Uses absoluteBoundingBox (the layout box),
 * never absoluteRenderBounds (which pads for shadows/blurs/effects) — a drop
 * shadow bleeding past a card's edge is expected and must not
 * false-positive here. A child with layoutPositioning ABSOLUTE is exempt: a
 * deliberately absolutely-positioned decorative child legitimately extends
 * past its parent in some designs, and is a design choice, not a defect.
 */
export function unclippedOverflowViolations(node: AnyNode): Violation[] {
  if (node.clipsContent !== false) return []
  const parentBox = node.absoluteBoundingBox
  if (!parentBox) return []
  const violations: Violation[] = []
  for (const child of node.children ?? []) {
    if (child?.layoutPositioning === 'ABSOLUTE') continue
    const childBox = child?.absoluteBoundingBox
    if (!childBox) continue
    const overflows =
      childBox.x < parentBox.x ||
      childBox.y < parentBox.y ||
      childBox.x + childBox.width > parentBox.x + parentBox.width ||
      childBox.y + childBox.height > parentBox.y + parentBox.height
    if (!overflows) continue
    violations.push({
      rule: 'unclipped-overflow',
      detail: `child "${child.name}" extends beyond parent bounds while the parent has clipsContent disabled`
    })
  }
  return violations
}

/**
 * Universal per-node check (no tags, no config): a HUG-sized node whose
 * child's bounds escape it renders clipped or overflowing content — true for
 * any component, not just row-shaped ones.
 */
// Sub-pixel float noise is endemic (icon instances measure e.g. 14.0000009px);
// anything under a tenth of a pixel cannot render as visible overflow.
const HUG_OVERFLOW_EPSILON_PX = 0.1

export function hugOverflowViolations(node: AnyNode): Violation[] {
  const violations: Violation[] = []
  for (const child of node.children ?? []) {
    // Hidden children don't render, so they can't overflow; absolute-
    // positioned children are out of flow, so HUG never includes them.
    // child.x/child.y are already in the parent's coordinate space — the
    // node's own width/height are the bounds, never node.x/node.y (a
    // different coordinate space).
    if (child.visible === false) continue
    if (child.layoutPositioning === 'ABSOLUTE') continue
    if (node.layoutSizingHorizontal === 'HUG' && child.x + child.width > node.width + HUG_OVERFLOW_EPSILON_PX) {
      violations.push({ rule: 'hug-overflow-horizontal', detail: `"${node.name}" is HUG-horizontal but child "${child.name}" extends past its right edge` })
    }
    if (node.layoutSizingVertical === 'HUG' && child.y + child.height > node.height + HUG_OVERFLOW_EPSILON_PX) {
      violations.push({ rule: 'hug-overflow-vertical', detail: `"${node.name}" is HUG-vertical but child "${child.name}" extends past its bottom edge` })
    }
  }
  return violations
}
