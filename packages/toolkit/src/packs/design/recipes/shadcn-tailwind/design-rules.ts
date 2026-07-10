/**
 * Design-rules recipe rules for the shadcn-tailwind recipe — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside
 * Figma's Plugin API sandbox. The Plugin-API walker marshals live `figma.*`
 * objects into these shapes and calls these functions.
 */

type Variable = { remote?: boolean; key?: string; collectionName?: string | null }

/**
 * Recipe-declared allowlist: a stock kit duplicate deliberately splits
 * non-color tokens across a `tw/*` collection family instead of folding them
 * into the Semantic collection, so a pristine kit component fails this check
 * as shipped without this allowlist. Declared here (recipe-owned) since this
 * is a fixed characteristic of the shadcn-tailwind starter file, not
 * per-project config.
 */
export const TW_COLLECTION_FAMILY = ['tw/gap', 'tw/padding', 'tw/font', 'tw/stroke-width', 'tw/border-radius', 'tw/border-width', 'tw/margin', 'tw/space']

/**
 * Starter-file model: the design file is a self-contained duplicate of the
 * maintained starter file, all components and variables local. A color
 * binding is valid only if it resolves to a local variable whose collection
 * is the configured Semantic collection, or the recipe-declared `tw/*` family
 * above.
 *
 * `variable.collectionName`, not presence of a variableCollectionId, is the
 * deciding field: checking only "has some local collection" is vacuous,
 * since a component bound directly to a local Primitives variable also has
 * a variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable: Variable, semanticCollectionName = 'Semantic', additionalAllowedCollectionNames: string[] = TW_COLLECTION_FAMILY) {
  if (!variable.remote && variable.collectionName === semanticCollectionName) return null
  if (!variable.remote && variable.collectionName && additionalAllowedCollectionNames.includes(variable.collectionName)) return null
  return {
    rule: 'non-semantic-binding',
    detail: `bound to a variable outside the local ${semanticCollectionName} collection`
  }
}
