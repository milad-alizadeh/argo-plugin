/**
 * Recipe-owned tier-0 checks for the shadcn-tailwind recipe (D23) — the thin
 * Plugin-API walker half: marshals live `figma.*` node/variable objects into
 * plain-object shapes and delegates to this recipe's unit-tested pure
 * functions (./tier0-rules.js). `bundle-tier0-audit`'s generated entry module
 * imports `runRecipeTier0Checks` from here and bakes it into the bundle
 * `use_figma` runs, with project DATA (the Semantic collection name) read
 * Node-side by `prepare-tier0-audit-options.js` and threaded back in via the
 * options object at call time — see design-kit/tier0-audit.js's doc comment
 * for the full data-flow.
 *
 * `runRecipeTier0Checks` reads `figma.variables.*` and can't be unit-tested
 * outside Figma's sandbox (same documented accepted gap as the mechanism's
 * own auditNode).
 *
 * Runs exclusively inside Figma's `use_figma` sandbox, where `figma` is a
 * runtime global — declared `any` locally (see design-kit/tier0-audit.ts's
 * doc comment for why no `@figma/plugin-typings` dependency is added here).
 */
declare const figma: any

import { nonSemanticBindingViolation } from './tier0-rules.js'

// Gap/padding fields legally bind Primitives spacing variables (D24, revised
// 2026-07-05) — they are governed by gapPaddingSpacingViolations, so exclude
// them from this Semantic-only sweep.
const SPACING_FIELDS = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'counterAxisSpacing'])

export async function runRecipeTier0Checks(
  node: any,
  {
    hard,
    semanticCollectionName = 'Semantic',
    insideInstance = false,
    isScreenFrame = false
  }: { hard: boolean; semanticCollectionName?: string; insideInstance?: boolean; isScreenFrame?: boolean } = { hard: false }
) {
  // A registered screen's own top-level artboard is exempt: its background is
  // bound to a library/theme token by design (matches the shipped shell every
  // sibling screen clones). isScreenFrame is registry-derived, frame-only —
  // descendants (isScreenFrame=false) are still gated.
  if (isScreenFrame) return []
  // Kit internals are exempt (2026-07-07, consistent with the insideInstance
  // exemption on unbound-fill/stroke/radius/type): a kit sub-instance nested
  // inside an audited custom component (a Breadcrumb or icon-glyph swap)
  // legitimately binds to the kit's own collections; a designer never authored
  // those bindings and cannot rebind them. Without this, non-semantic-binding
  // fired ~30 times on kit internals the audit only descended into.
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
    const nonSemantic = nonSemanticBindingViolation(marshaledVariable, semanticCollectionName)
    if (nonSemantic) report(nonSemantic.rule, nonSemantic.detail)
  }

  return violations
}
