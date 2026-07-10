import type { AnyNode, Violation } from './types.js'

/** node.storyUrl is resolved by the walker from shared plugin data (namespace 'argo', key 'storyUrl'); private plugin data is a legacy fallback. */
export function storyUrlScopeViolation(node: AnyNode): Violation | null {
  if (node.type === 'COMPONENT' && node.storyUrl && !node.storyUrl.includes('node-id=')) {
    return { rule: 'non-node-scoped-story-url', detail: `storyUrl "${node.storyUrl}" is not node-scoped` }
  }
  return null
}

/**
 * Advisory-only reconciliation for a component that isn't a child of any
 * category shelf frame on `Custom Components` — a human manually rearranged
 * it, or an agent placed it directly on the page instead of `appendChild`-ing
 * to the resolved shelf. Never blocks — self-corrects on the next
 * design-component upsert. `insideCategoryShelf` is marshaled by the walker
 * from the node's parent chain against the configured `componentCategories`
 * shelf frames.
 */
export function unsectionedComponentViolation(node: AnyNode): Violation | null {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return null
  if (node.insideCategoryShelf) return null
  return {
    rule: 'unsectioned-component',
    detail: `component "${node.name}" is not a child of any category shelf frame on Custom Components`
  }
}

/** A component with no description misses the one place in-file facts (purpose + usage) can't drift. Advisory on the file-wide sweep, hard on a named audit. */
export function missingComponentDescriptionViolation(node: AnyNode): Violation | null {
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return null
  // Variant children inside a COMPONENT_SET don't each need a description —
  // the set root is the documented unit.
  if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') return null
  if (node.description) return null
  return {
    rule: 'missing-component-description',
    detail: `component "${node.name}" has no description (purpose + category, one line)`
  }
}

/**
 * ADVISORY only: in a composed SCREEN, a node named after a known composite
 * (`compositeNames` — the project's registered composite names) that is a
 * plain FRAME rather than an INSTANCE of that component is under-decomposition
 * — a traced screen, not one composed from built components. This is
 * deliberately advisory, NOT a hard authoritative decomposition gate, which is
 * deferred until its brief/story-map schema lands — never wire this as a
 * hard-fail.
 */
export function compositeRegionNamingViolation(node: AnyNode, compositeNames: string[]): Violation | null {
  if (node.type !== 'FRAME') return null
  if (!(compositeNames ?? []).includes(node.name)) return null
  // Wrapper-frame exemption: a FRAME named after a composite that DIRECTLY
  // contains an INSTANCE of that same composite is the legitimate
  // clip/shadow/effect-wrapper idiom (a `Card` frame wrapping a `Card`
  // instance), not a traced replacement. Only a same-named frame with NO such
  // instance inside is under-decomposition.
  const children: AnyNode[] = node.children ?? []
  if (children.some((c) => c?.type === 'INSTANCE' && c?.name === node.name)) return null
  return {
    rule: 'composite-region-traced-not-instance',
    detail: `frame "${node.name}" is named after a composite component but is a plain FRAME, not an INSTANCE — looks traced, not composed`
  }
}
