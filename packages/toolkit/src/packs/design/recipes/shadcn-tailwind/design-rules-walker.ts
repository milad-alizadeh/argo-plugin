/**
 * Recipe-owned design-rules checks for the shadcn-tailwind recipe — the thin
 * Plugin-API walker half: marshals live `figma.*` node/variable objects into
 * plain-object shapes and delegates to this recipe's unit-tested pure
 * functions. Reads `figma.variables.*` and so can't be unit-tested outside
 * Figma's sandbox; `figma` is declared `any` locally since it only exists as
 * a runtime global inside that sandbox.
 */
declare const figma: any

import { nonSemanticBindingViolation } from './design-rules.js'

// Gap/padding fields legally bind Primitives spacing variables and are
// governed by gapPaddingSpacingViolations, so exclude them from this
// Semantic-only sweep.
const SPACING_FIELDS = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'counterAxisSpacing'])

export async function runRecipeDesignRulesChecks(
  node: any,
  {
    hard,
    semanticCollectionName = 'Semantic',
    insideInstance = false,
    isScreenFrame = false
  }: { hard: boolean; semanticCollectionName?: string; insideInstance?: boolean; isScreenFrame?: boolean } = { hard: false }
) {
  // A registered screen's own top-level artboard is exempt: its background is
  // bound to a library/theme token by design, matching the shipped shell
  // every sibling screen clones. Descendants are still gated.
  if (isScreenFrame) return []
  // Kit internals are exempt: a kit sub-instance nested inside an audited
  // custom component legitimately binds to the kit's own collections, and a
  // designer never authored those bindings and cannot rebind them.
  if (insideInstance) return []
  const violations: any[] = []
  const report = (rule: string, detail: string) => {
    violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail })
  }

  const boundVars = node.boundVariables ? Object.entries(node.boundVariables) : []
  for (const [fieldName, bound] of boundVars as [string, any][]) {
    if (SPACING_FIELDS.has(fieldName)) continue
    const alias = Array.isArray(bound) ? bound[0] : bound
    if (!alias?.id) continue
    const variable = await figma.variables.getVariableByIdAsync(alias.id)
    if (!variable) continue

    // collectionName (not just presence of variableCollectionId) is what actually
    // distinguishes the Semantic collection from a local Primitives collection:
    // a variableCollectionId-only check is vacuous, since Primitives bindings
    // have one too.
    //
    // Marshal explicitly, field by field — a live Variable object's remote/key/
    // variableCollectionId are prototype getters, not own enumerable properties,
    // so `{ ...variable }` silently drops them (confirmed live: spread yielded
    // only `{ id }`).
    const collection = variable.variableCollectionId
      ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
      : null
    const marshaledVariable = {
      remote: variable.remote,
      key: variable.key,
      collectionName: collection?.name ?? null
    }
    const nonSemantic = nonSemanticBindingViolation(marshaledVariable, semanticCollectionName)
    if (nonSemantic) report(nonSemantic.rule, nonSemantic.detail)
  }

  return violations
}
