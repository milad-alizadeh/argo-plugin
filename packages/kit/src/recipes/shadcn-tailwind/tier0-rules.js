/**
 * Tier-0 recipe rules for the shadcn-tailwind recipe (D23) — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside Figma's
 * Plugin API sandbox. The Plugin-API walker
 * (templates/design/recipes/shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js)
 * marshals live `figma.*` objects into these shapes and calls these functions.
 */

/**
 * Relocated from templates/design/tier0-audit.js (was inline, kit-coupled).
 * A bound variable is either kit-sourced or bound to the project's actual
 * Semantic collection by name — anything else (including a local
 * Primitives-collection binding) is a non-Semantic binding.
 *
 * Kit-sourced detection (revised 2026-07-05): a remote Variable's `key` is a
 * plain 40-char hash with NO file-key prefix — live verification showed
 * `key.startsWith(fileKey)` never matches, which failed every legitimate kit
 * icon binding and forced instance detaching. The precise membership test is
 * against `kitVariableKeys`, the kit's variable-key manifest (kit.lock,
 * recorded at sync/seed time from importVariableByKeyAsync's own keys). When
 * no manifest exists yet (pre-first-sync), any remote binding counts as
 * kit-sourced — the design pack's model permits exactly one subscribed
 * library, so remote ⇒ kit until a manifest can say otherwise.
 *
 * `variable.collectionName` — NOT presence of a variableCollectionId — is
 * the deciding field: live-Figma verification (Slice 14) confirmed that
 * checking only "has some local collection" is vacuous, since a component
 * bound directly to a local Primitives variable also has a
 * variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable, kitVariableKeys = null, semanticCollectionName = 'Semantic') {
  const manifest = Array.isArray(kitVariableKeys) && kitVariableKeys.length > 0 ? kitVariableKeys : null
  const isKitSourced = Boolean(variable.remote && (!manifest || manifest.includes(variable.key)))
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
 * variable left stale by a Library Swap. Matches by exact retired VARIABLE
 * key (recorded by design-upgrade at swap time from the outgoing kit.lock) —
 * file-key prefix matching never worked; see nonSemanticBindingViolation.
 */
export function retiredFileKeyBindingViolation(variable, retiredVariableKeys = []) {
  if (variable.key && retiredVariableKeys.includes(variable.key)) {
    return { rule: 'retired-file-key-binding', detail: `bound variable "${variable.key}" belongs to a retired kit library version` }
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
