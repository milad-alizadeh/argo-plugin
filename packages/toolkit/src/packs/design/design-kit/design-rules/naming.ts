import type { AnyNode, Violation } from './types.js'

const NAMED_AUDIT_TARGET_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'FRAME', 'SECTION'])

/**
 * Named audit matching predicate. A named audit must be able to target
 * SCREENS and foundation frames, not only components — those are
 * FRAME/SECTION nodes, which a COMPONENT/COMPONENT_SET-only match would
 * silently miss.
 */
export function isNamedAuditTarget(node: AnyNode, name: string): boolean {
  return node.name === name && NAMED_AUDIT_TARGET_TYPES.has(node.type)
}

/**
 * Cover-page exemption: the `Cover` page (the design-language legend) is never
 * code-synced. Nodes on it produce zero design-rules violations at every
 * severity — unbound fills/strokes there are expected, not a defect.
 */
export function isCoverPageName(name: string): boolean {
  return name === 'Cover'
}

/**
 * Hi-fi screen page naming (`D<NN> <group>`). Used to gate the
 * screen-viewport-mismatch check to top-level screen frames only, never
 * component-definition frames on Custom Components.
 */
export function isDesignPageName(name: string): boolean {
  return /^D\d{2}(\b|\s)/.test(name)
}

// Structural container names that carry no role — figma-to-code can't map
// them to a slot/prop/sub-component, so they're not code-friendly. Kept tight
// (clear non-signal words only) to avoid false positives on real role names.
const GENERIC_LAYER_NAMES = new Set([
  'box',
  'wrapper',
  'wrap',
  'container',
  'holder',
  'thing',
  'stuff',
  'div',
  'element',
  'layer',
  'object',
  'content',
  'item',
  'block',
  'area',
  'group',
  'frame'
])

export function nonSemanticNameViolation(node: AnyNode): Violation | null {
  // Nodes inside a library instance are exempt (2026-07-05): kit internals
  // carry the kit's own auto-names and are not ours to rename — flagging
  // them made pristine kit instances fail the hard gate.
  if (node.insideInstance) return null
  if (/^(Frame|Group|Rectangle|Ellipse|Text|Vector)\s?\d*$/.test(node.name)) {
    return { rule: 'non-semantic-name', detail: `node name "${node.name}" looks auto-generated, not semantic` }
  }
  // A top-level screen frame carries a human-facing, page-style name and is
  // addressed by a CLI slug, never consumed as a code identifier — so the
  // code-friendly-name predicate below must not fire on the screen frame's
  // own name. isScreenFrame is set only for the frame itself; descendant
  // containers are still gated as normal.
  if (node.isScreenFrame) return null
  // Structural containers must carry a role name figma-to-code can map to an
  // identifier. Scoped to FRAME/GROUP — a TEXT layer's name is usually its
  // content, and icon INSTANCEs carry kit names, so neither is ours to gate
  // here. Advisory in a file-wide sweep, hard on a named audit (the report()
  // caller assigns severity), so authoring a component with a vague layer
  // name fails loud while an untouched design only gets a nudge.
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    const trimmed = node.name.trim()
    if (GENERIC_LAYER_NAMES.has(trimmed.toLowerCase())) {
      return {
        rule: 'non-code-friendly-name',
        detail: `layer name "${node.name}" is too generic to map to code — name it by role (e.g. file-diff-header, change-counts)`
      }
    }
    if (/\s/.test(trimmed)) {
      const suggestion = trimmed.replace(/\s+/g, '-').replace(/[^\w-]/g, '').toLowerCase()
      return {
        rule: 'non-code-friendly-name',
        detail: `layer name "${node.name}" has spaces — use kebab-case or camelCase so figma-to-code can map it to an identifier (e.g. "${suggestion}")`
      }
    }
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
