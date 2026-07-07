/**
 * Tier-0 recipe rules for the shadcn-tailwind recipe (D23) — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside Figma's
 * Plugin API sandbox. The Plugin-API walker (./tier0-walker.js) marshals live
 * `figma.*` objects into these shapes and calls these functions.
 */

type Variable = { remote?: boolean; key?: string; collectionName?: string | null }

/**
 * Recipe-declared allowlist (field bug, 2026-07-07 live D01 build): a stock
 * kit duplicate deliberately splits non-color tokens across a `tw/*`
 * collection family instead of folding them into the Semantic collection —
 * a pristine, untouched kit component fails this check as shipped without
 * this allowlist. Declared here (recipe-owned), not per-project config —
 * this is a fixed characteristic of the shadcn-tailwind starter file, not
 * something a project author configures.
 */
export const TW_COLLECTION_FAMILY = ['tw/gap', 'tw/padding', 'tw/font', 'tw/stroke-width', 'tw/border-radius', 'tw/border-width', 'tw/margin', 'tw/space']

/**
 * Starter-file model (2026-07-07): the design file is a self-contained
 * duplicate of the maintained starter file — ALL components and variables
 * are local, theme = modes on the file's own Semantic collection. A color
 * binding is therefore valid ONLY if it resolves to a LOCAL variable whose
 * collection is the configured Semantic collection (component-scoped tokens
 * like button/primary-bg live inside Semantic, so they pass naturally), OR
 * the recipe-declared `tw/*` family above.
 *
 * `variable.collectionName` — NOT presence of a variableCollectionId — is
 * the deciding field for a local binding: live-Figma verification (Slice 14)
 * confirmed that checking only "has some local collection" is vacuous, since
 * a component bound directly to a local Primitives variable also has a
 * variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable: Variable, semanticCollectionName = 'Semantic', additionalAllowedCollectionNames: string[] = TW_COLLECTION_FAMILY) {
  if (!variable.remote && variable.collectionName === semanticCollectionName) return null
  if (!variable.remote && variable.collectionName && additionalAllowedCollectionNames.includes(variable.collectionName)) return null
  return {
    rule: 'non-semantic-binding',
    detail: `bound to a variable outside the local ${semanticCollectionName} collection`
  }
}
