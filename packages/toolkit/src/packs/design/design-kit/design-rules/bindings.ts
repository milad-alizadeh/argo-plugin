import type { AnyNode, Violation } from './types.js'

export function unboundFillViolations(node: AnyNode): Violation[] {
  // Kit internals bind the kit's own color collections — not ours to rebind.
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
  // Kit internals bind the kit's own color collections — not ours to rebind.
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
 * never flagged. A radius counts as bound either via the uniform
 * `boundVariables.cornerRadius`, or via all four per-corner fields being bound.
 * A COMPONENT_SET container is skipped entirely: Figma gives every
 * combineAsVariants container a default cornerRadius of 5 (the purple dashed
 * editor chrome), not a design surface and not bindable to a token.
 */
export function unboundRadiusViolation(node: AnyNode): Violation | null {
  // Kit internals bind the kit's own radius collections — not ours to rebind.
  if (node.insideInstance) return null
  if (node.type === 'COMPONENT_SET') return null
  if (!('cornerRadius' in node) || typeof node.cornerRadius !== 'number' || node.cornerRadius === 0) return null
  const bound = node.boundVariables ?? {}
  const boundUniform = Boolean(bound.cornerRadius)
  const boundPerCorner = PER_CORNER_RADIUS_FIELDS.every((field) => Boolean(bound[field]))
  if (boundUniform || boundPerCorner) return null
  return { rule: 'unbound-radius', detail: 'cornerRadius has no bound variable' }
}
