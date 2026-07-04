/**
 * Tier-0 recipe rules for shadcn-tailwind-external-kit (D23) — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside Figma's
 * Plugin API sandbox. The Plugin-API walker
 * (templates/design/recipes/shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js)
 * marshals live `figma.*` objects into these shapes and calls these functions.
 */

/**
 * Relocated from templates/design/tier0-audit.js (was inline, kit-coupled).
 * A bound variable is either kit-sourced (its key resolves to the kit library
 * file) or bound to the project's actual Semantic collection by name —
 * anything else (including a local Primitives-collection binding) is a
 * non-Semantic binding outside the kit library.
 *
 * `variable.collectionName` — NOT presence of a variableCollectionId — is
 * the deciding field: live-Figma verification (Slice 14) confirmed that
 * checking only "has some local collection" is vacuous, since a component
 * bound directly to a local Primitives variable also has a
 * variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable, kitLibraryFileKey, semanticCollectionName = 'Semantic') {
  const isKitSourced = Boolean(variable.remote && variable.key?.startsWith(kitLibraryFileKey))
  const isSemantic = !isKitSourced && variable.collectionName === semanticCollectionName
  if (!isKitSourced && !isSemantic) {
    return {
      rule: 'non-semantic-binding',
      detail: `bound to a non-${semanticCollectionName} variable outside the kit library`
    }
  }
  return null
}

/**
 * New (closes the design-upgrade/SKILL.md:23-29 doc/code gap): flags a bound
 * variable whose key resolves to a retired kit library file key, not the
 * current one — a Library Swap left over a stale binding.
 */
export function retiredFileKeyBindingViolation(variable, retiredLibraryFileKeys = []) {
  const retiredKey = retiredLibraryFileKeys.find((key) => variable.key?.startsWith(key))
  if (retiredKey) {
    return { rule: 'retired-file-key-binding', detail: `bound variable resolves to a retired kit library file key "${retiredKey}"` }
  }
  return null
}

/**
 * New (closes the figma-audit/SKILL.md:24 doc/code gap): flags a modified
 * node inside the kit copy whose component/file isn't recorded in
 * design/kit-patches.json (D13/D15 — a patch entry means the edit is
 * sanctioned, not drift).
 */
export function kitPatchesConformanceViolations(modifiedNodes, kitPatches = {}) {
  const violations = []
  for (const { component, file } of modifiedNodes) {
    const isPatched = Boolean(kitPatches[component]?.includes(file))
    if (!isPatched) {
      violations.push({
        rule: 'kit-patches-conformance',
        detail: `edit to kit copy "${component}"/"${file}" is not recorded in kit-patches.json`
      })
    }
  }
  return violations
}
