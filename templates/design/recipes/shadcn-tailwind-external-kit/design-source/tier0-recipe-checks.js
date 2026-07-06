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
 * {{KIT_VARIABLE_KEYS_JSON}} — JSON array of the kit's variable keys (from
 *   kit.lock, recorded at sync/seed time). `[]` until the first sync — the
 *   rule then treats any remote binding as kit-sourced (single-subscribed-
 *   library model). Real variable keys are plain hashes; file-key prefix
 *   matching never worked (revised 2026-07-05).
 * {{RETIRED_KIT_VARIABLE_KEYS_JSON}} — JSON array of variable keys retired by
 *   a Library Swap (recorded by design-upgrade from the outgoing kit.lock).
 */

import {
  nonSemanticBindingViolation,
  retiredFileKeyBindingViolation,
  kitPatchesConformanceViolations
} from '@argohq/kit/design-kit/shadcn-tailwind/tier0-rules'
import kitPatches from './kit-patches.json'

const KIT_VARIABLE_KEYS = JSON.parse('{{KIT_VARIABLE_KEYS_JSON}}')
const RETIRED_KIT_VARIABLE_KEYS = JSON.parse('{{RETIRED_KIT_VARIABLE_KEYS_JSON}}')
// SEMANTIC_COLLECTION_NAME is declared above this file's splice point in the
// assembled tier0-audit.js — same module scope, available here as a free variable.

// Gap/padding fields legally bind Primitives spacing variables (D24, revised
// 2026-07-05) — they are governed by gapPaddingSpacingViolations, so exclude
// them from this Semantic-only sweep.
const SPACING_FIELDS = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'counterAxisSpacing'])

async function runRecipeTier0Checks(node, { hard }) {
  const violations = []
  const report = (rule, detail) => {
    violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail })
  }

  const boundVars = node.boundVariables ? Object.entries(node.boundVariables) : []
  for (const [fieldName, bound] of boundVars) {
    if (SPACING_FIELDS.has(fieldName)) continue
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
    const nonSemantic = nonSemanticBindingViolation(marshaledVariable, KIT_VARIABLE_KEYS, SEMANTIC_COLLECTION_NAME)
    if (nonSemantic) report(nonSemantic.rule, nonSemantic.detail)

    const retiredKey = retiredFileKeyBindingViolation(marshaledVariable, RETIRED_KIT_VARIABLE_KEYS)
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
