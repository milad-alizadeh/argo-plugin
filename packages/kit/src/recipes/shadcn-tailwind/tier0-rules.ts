/**
 * Tier-0 recipe rules for the shadcn-tailwind recipe (D23) — pure predicate
 * functions over plain-object variable/node shapes, unit-tested outside Figma's
 * Plugin API sandbox. The Plugin-API walker (./tier0-walker.js) marshals live
 * `figma.*` objects into these shapes and calls these functions.
 */

type Variable = { remote?: boolean; key?: string; collectionName?: string | null }

/**
 * Relocated from templates/design/tier0-audit.js (was inline, kit-coupled).
 * A bound variable is either remote (library-sourced — the framework's own
 * kit internals, never authored or bound by project design work, so this
 * check has no opinion on them) or bound to the project's actual Semantic
 * collection by name — anything else (a LOCAL variable outside Semantic,
 * e.g. a local Primitives-collection binding) is a non-Semantic binding.
 *
 * Fails open on any remote/library binding, unconditionally (no manifest —
 * removed 2026-07-07: the kit's ~1800-entry variable-key list bloated every
 * audit call by ~79KB just to distinguish "kit-sourced" from "some other
 * library", a distinction this check never needed to make — a remote
 * binding is by definition not a local out-of-Semantic one, so it always
 * passes here regardless of which library it came from).
 *
 * `variable.collectionName` — NOT presence of a variableCollectionId — is
 * the deciding field for a local binding: live-Figma verification (Slice 14)
 * confirmed that checking only "has some local collection" is vacuous, since
 * a component bound directly to a local Primitives variable also has a
 * variableCollectionId and would incorrectly pass.
 */
export function nonSemanticBindingViolation(variable: Variable, semanticCollectionName = 'Semantic') {
  if (variable.remote) return null
  if (variable.collectionName === semanticCollectionName) return null
  return {
    rule: 'non-semantic-binding',
    detail: `bound to a non-${semanticCollectionName} variable outside the kit library`
  }
}

/**
 * New (closes the design-upgrade/SKILL.md:23-29 doc/code gap): flags a bound
 * variable left stale by a Library Swap. Matches by exact retired VARIABLE
 * key (recorded by design-upgrade at swap time from the outgoing kit.lock) —
 * file-key prefix matching never worked; see nonSemanticBindingViolation.
 */
export function retiredFileKeyBindingViolation(variable: Variable, retiredVariableKeys: string[] = []) {
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
export function kitPatchesConformanceViolations(
  modifiedNodes: { component: string; file: string }[],
  kitPatches: Record<string, string[]> = {}
) {
  const violations: { rule: string; detail: string }[] = []
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
