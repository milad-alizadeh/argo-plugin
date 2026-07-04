/**
 * Recipe-owned tier-0 checks for shadcn-tailwind-external-kit (D23). Thin
 * Plugin-API walker: marshals live `figma.*` node/variable objects into
 * plain-object shapes and delegates to figma-design-kit-shadcn-tailwind's
 * unit-tested pure functions. Spliced into templates/design/tier0-audit.js's
 * marked injection region by /argo:setup-design at install time — the host
 * project always runs ONE assembled script (X3/F12), never this file
 * separately.
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

export async function runRecipeTier0Checks(node, { hard }) {
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

    const nonSemantic = nonSemanticBindingViolation(variable, KIT_LIBRARY_FILE_KEY)
    if (nonSemantic) report(nonSemantic.rule, nonSemantic.detail)

    const retiredKey = retiredFileKeyBindingViolation(variable, RETIRED_KIT_LIBRARY_FILE_KEYS)
    if (retiredKey) report(retiredKey.rule, retiredKey.detail)
  }

  // kit-patches-conformance is a file-wide check (compares the kit-copy file's
  // modified nodes against kit-patches.json), not a per-node one — the caller
  // runs it once, separately, via runKitPatchesConformance below.

  return violations
}

/**
 * Runs once per audit (not per node): given the kit-copy file's modified
 * nodes (walker-detected — e.g. via a dirty/edited-since-import marker), flag
 * any not recorded in kit-patches.json (D13/D15).
 */
export function runKitPatchesConformance(modifiedNodes) {
  return kitPatchesConformanceViolations(modifiedNodes, kitPatches).map(({ rule, detail }) => ({
    severity: 'hard',
    rule,
    detail
  }))
}
