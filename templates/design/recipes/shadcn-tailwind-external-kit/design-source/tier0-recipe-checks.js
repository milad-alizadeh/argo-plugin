/**
 * Recipe-owned tier-0 checks for shadcn-tailwind-external-kit (D23). Thin
 * Plugin-API walker: marshals live `figma.*` node/variable objects into
 * plain-object shapes and delegates to figma-design-kit-shadcn-tailwind's
 * unit-tested pure functions. `setup-design`'s §4 assembly step splices this
 * file's ENTIRE content verbatim into templates/design/tier0-audit.js's
 * `// {{RECIPE_TIER0_CHECKS}}` marker line (at module top level, so this
 * file's own `import`s survive intact) — the host project always runs ONE
 * assembled canonical script (X3/F12), never this file separately.
 *
 * {{KIT_LIBRARY_FILE_KEY}} — the published kit library's Figma file key, used
 *   to distinguish kit-sourced variables from project-local ones.
 * {{RETIRED_KIT_LIBRARY_FILE_KEYS_JSON}} — a JSON array literal (e.g. `[]` or
 *   `["oldKey123"]`) of previously-swapped-out kit library file keys still
 *   worth flagging stale bindings against.
 */

import {
  nonSemanticBindingViolation,
  retiredFileKeyBindingViolation,
  kitPatchesConformanceViolations
} from 'figma-design-kit-shadcn-tailwind'
import kitPatches from './kit-patches.json'

const KIT_LIBRARY_FILE_KEY = '{{KIT_LIBRARY_FILE_KEY}}'
const RETIRED_KIT_LIBRARY_FILE_KEYS = JSON.parse('{{RETIRED_KIT_LIBRARY_FILE_KEYS_JSON}}')
// SEMANTIC_COLLECTION_NAME is declared above this file's splice point in the
// assembled tier0-audit.js — same module scope, available here as a free variable.

async function runRecipeTier0Checks(node, { hard }) {
  const violations = []
  const report = (rule, detail) => {
    violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail })
  }

  const boundVars = node.boundVariables ? Object.values(node.boundVariables) : []
  for (const bound of boundVars) {
    const alias = Array.isArray(bound) ? bound[0] : bound
    if (!alias?.id) continue
    const variable = await figma.variables.getVariableByIdAsync(alias.id)
    if (!variable) continue

    // collectionName (not just presence of variableCollectionId) is what actually
    // distinguishes the Semantic collection from a local Primitives collection —
    // live-Figma verification (Slice 14) confirmed a variableCollectionId-only
    // check is vacuous, since Primitives bindings have one too.
    //
    // Marshal explicitly, field by field — a live Variable object's remote/key/
    // variableCollectionId are prototype getters, NOT own enumerable properties,
    // so `{ ...variable }` silently drops them (confirmed live, Slice 14: spread
    // yielded only `{ id }`). Always name the fields a pure function needs.
    const collection = variable.variableCollectionId
      ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
      : null
    const marshaledVariable = {
      remote: variable.remote,
      key: variable.key,
      collectionName: collection?.name ?? null
    }
    const nonSemantic = nonSemanticBindingViolation(marshaledVariable, KIT_LIBRARY_FILE_KEY, SEMANTIC_COLLECTION_NAME)
    if (nonSemantic) report(nonSemantic.rule, nonSemantic.detail)

    const retiredKey = retiredFileKeyBindingViolation(marshaledVariable, RETIRED_KIT_LIBRARY_FILE_KEYS)
    if (retiredKey) report(retiredKey.rule, retiredKey.detail)
  }

  return violations
}

/**
 * Runs once per audit (not per node), called from tier0-audit.js's
 * runTier0Audit after the assembled script's collectModifiedKitCopyNodes()
 * marshals the kit-copy file's modified nodes: flag any not recorded in
 * kit-patches.json (D13/D15).
 */
function runKitPatchesConformance(modifiedNodes) {
  return kitPatchesConformanceViolations(modifiedNodes, kitPatches).map(({ rule, detail }) => ({
    severity: 'hard',
    rule,
    detail
  }))
}
