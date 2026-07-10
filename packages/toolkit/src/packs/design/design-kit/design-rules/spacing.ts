import type { AnyNode, Violation } from './types.js'

export type GapPaddingCollectionsConfig = {
  /** Project-configured Semantic collection name (`argo.json`'s `semanticCollectionName`); defaults to the literal `'Semantic'` for a project with no config. */
  semanticCollectionName?: string
  /** Project-configured Primitives collection name; defaults to the literal `'Primitives'` for a project with no config. */
  primitivesCollectionName?: string
  /**
   * Recipe-declared allowlist of additional collection names a spacing
   * binding may legally resolve to (e.g. shadcn-tailwind's `tw/gap`,
   * `tw/padding`, `tw/margin`, `tw/space` family — a stock kit duplicate
   * deliberately splits spacing tokens across these instead of a single
   * Primitives/Semantic collection). Empty for a recipe that declares none.
   */
  additionalAllowedCollectionNames?: string[]
}

/**
 * No collection-name literals here: a stock kit duplicate that never renamed
 * its Semantic collection (named `mode`) and splits spacing tokens across a
 * `tw/*` collection family would fail this check on every one of its own
 * untouched components if the accepted names were hardcoded — every accepted
 * name is configured/declared by the caller instead.
 */
export function gapPaddingSpacingViolations(node: AnyNode, config: GapPaddingCollectionsConfig = {}): Violation[] {
  const { semanticCollectionName = 'Semantic', primitivesCollectionName = 'Primitives', additionalAllowedCollectionNames = [] } = config
  const acceptedCollections = new Set([semanticCollectionName, primitivesCollectionName, ...additionalAllowedCollectionNames])
  // Kit internals bind the kit's own spacing collections (e.g. tw/gap) — not
  // ours to rebind.
  if (node.insideInstance) return []
  // INSTANCE nodes' own gap/padding mirrors their component definition —
  // locally-authored components are audited at the definition; kit instances'
  // boundary nodes carry the kit's own bindings (tw/gap observed live).
  if (node.layoutMode === 'NONE' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE')
    return []
  const violations: Violation[] = []
  for (const entry of node.gapAndPadding ?? []) {
    const { field, value, bound, collectionName } = entry
    if (!bound) {
      if (value !== 0) {
        violations.push({
          rule: 'gap-padding-unbound',
          detail: `${field} value ${value} is an unbound literal; D24 requires binding a ${primitivesCollectionName} or ${semanticCollectionName} spacing variable`
        })
      }
    } else if (!acceptedCollections.has(collectionName)) {
      violations.push({
        rule: 'gap-padding-foreign-binding',
        detail: `${field} is bound to a variable outside the project collections ("${collectionName}"); D24 requires a ${primitivesCollectionName} or ${semanticCollectionName} spacing variable`
      })
    }
  }
  return violations
}
