/**
 * Tier-0 recipe rules for the shadcn-tailwind recipe (D23) — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside Figma's
 * Plugin API sandbox. The Plugin-API walker (./tier0-walker.js) marshals live
 * `figma.*` objects into these shapes and calls these functions.
 */

type Variable = { remote?: boolean; key?: string; collectionName?: string | null }

/**
 * Starter-file model (2026-07-07): the design file is a self-contained
 * duplicate of the maintained starter file — ALL components and variables
 * are local, theme = modes on the file's own Semantic collection. A color
 * binding is therefore valid ONLY if it resolves to a LOCAL variable whose
 * collection is the configured Semantic collection (component-scoped tokens
 * like button/primary-bg live inside Semantic, so they pass naturally).
 * A remote/library-sourced binding is itself a violation — there is no
 * subscribed kit library anymore, so nothing should ever bind one.
 *
 * `variable.collectionName` — NOT presence of a variableCollectionId — is
 * the deciding field for a local binding: live-Figma verification (Slice 14)
 * confirmed that checking only "has some local collection" is vacuous, since
 * a component bound directly to a local Primitives variable also has a
 * variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable: Variable, semanticCollectionName = 'Semantic') {
  if (!variable.remote && variable.collectionName === semanticCollectionName) return null
  return {
    rule: 'non-semantic-binding',
    detail: `bound to a variable outside the local ${semanticCollectionName} collection`
  }
}
