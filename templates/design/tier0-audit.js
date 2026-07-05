/**
 * Canonical tier-0 Figma hygiene audit (figma-to-code-pipeline.md §5 tier 0).
 *
 * Owned by /argo:figma-audit (X3) — /argo:figma-sync and /argo:figma-create
 * call this SAME script; do not fork a second copy. This is a thin Plugin-API
 * walker: it marshals live `figma.*` node/variable objects into plain-object
 * shapes and delegates the actual rule logic to `figma-design-kit`'s
 * unit-tested pure functions (packages/figma-design-kit/tier0-rules.js) — the
 * marshaling glue below still can't be unit-tested outside Figma, but the
 * rule logic it calls now can (see design-pack-recipes.md §2, decision B).
 *
 * {{SEMANTIC_COLLECTION_NAME}} — this project's Semantic variable collection
 *   name (e.g. "Semantic"), filled by /argo:setup-design from design/config.json.
 *
 * Reports violations as { severity: 'hard' | 'advisory', rule, nodeId, nodeName, detail }.
 * `hard` fails the calling skill loud (D8); `advisory` is a file-wide sweep
 * finding surfaced but not blocking (e.g. un-synced frames).
 *
 * --- RECIPE-CHECKS SPLICE MARKER ---
 * /argo:setup-design's §4 assembly step replaces the single marker line below
 * with the VERBATIM contents of the chosen recipe's design-source/
 * tier0-recipe-checks.js (its own `import`s survive intact since the splice
 * point is at module top level) — so the host project's installed
 * tier0-audit.js is always ONE assembled canonical script (X3/F12), never
 * two separately-executed files. For a `baseSource: none` recipe with no
 * checks file, the marker line is simply deleted, leaving
 * runRecipeTier0Checks/runKitPatchesConformance undefined — the guarded
 * calls below no-op in that case.
 */

import {
  unboundFillViolations,
  unboundStrokeViolations,
  unboundRadiusViolation,
  unboundTypeViolation,
  missingAutoLayoutViolation,
  detachedInstanceViolation,
  nonSemanticNameViolation,
  variantNamingViolations,
  modeCopyViolations,
  implicitLineHeightViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations
} from 'figma-design-kit'

const SEMANTIC_COLLECTION_NAME = '{{SEMANTIC_COLLECTION_NAME}}'

// {{RECIPE_TIER0_CHECKS}}

async function auditNode(node, { hard, spacingScale, semanticModes }) {
  const violations = []

  const report = (rule, detail) => {
    violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail })
  }

  for (const v of unboundFillViolations(node)) report(v.rule, v.detail)
  for (const v of unboundStrokeViolations(node)) report(v.rule, v.detail)
  const radius = unboundRadiusViolation(node)
  if (radius) report(radius.rule, radius.detail)
  const type = unboundTypeViolation(node)
  if (type) report(type.rule, type.detail)

  const autoLayout = missingAutoLayoutViolation(node)
  if (autoLayout) report(autoLayout.rule, autoLayout.detail)

  if ('layoutMode' in node) {
    const gapAndPadding = []
    const fields = node.layoutMode === 'NONE'
      ? ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
      : ['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
    for (const field of fields) {
      if (!(field in node)) continue
      gapAndPadding.push(await marshalGapPaddingField(node, field))
    }
    for (const v of gapPaddingSpacingViolations({ layoutMode: node.layoutMode, gapAndPadding }, spacingScale)) {
      report(v.rule, v.detail)
    }
  }

  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync()
    const detached = detachedInstanceViolation({ type: node.type, hasMainComponent: Boolean(main) })
    if (detached) report(detached.rule, detached.detail)
  }

  const nonSemanticName = nonSemanticNameViolation(node)
  if (nonSemanticName) report(nonSemanticName.rule, nonSemanticName.detail)

  for (const v of variantNamingViolations(node)) report(v.rule, v.detail)

  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const siblings = (node.parent?.children ?? []).filter((sibling) => sibling !== node)
    for (const v of modeCopyViolations({ type: node.type, name: node.name, siblings }, SEMANTIC_COLLECTION_NAME, semanticModes)) {
      report(v.rule, v.detail)
    }
  }

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  if (node.type === 'COMPONENT' && node.getPluginDataKeys().includes('storyUrl')) {
    const storyUrl = node.getPluginData('storyUrl')
    const storyScope = storyUrlScopeViolation({ type: node.type, storyUrl })
    if (storyScope) report(storyScope.rule, storyScope.detail)
  }

  // Recipe-owned per-node checks (e.g. non-semantic-binding, retired-file-key-binding)
  // — undefined for a baseSource: none recipe with no checks spliced above.
  if (typeof runRecipeTier0Checks === 'function') {
    violations.push(...(await runRecipeTier0Checks(node, { hard })))
  }

  return violations
}

/**
 * Marshals a single Auto Layout gap/padding field (D24). boundVariables for a
 * number property is a single { id } object, not an array (unlike fills/
 * strokes) — resolved and marshaled explicitly, field by field, same
 * convention as tier0-recipe-checks.js (remote/key/variableCollectionId are
 * prototype getters, not own properties, so never spread a live Variable).
 */
async function marshalGapPaddingField(node, field) {
  const value = node[field]
  const bound = node.boundVariables?.[field]
  if (!bound?.id) return { field, value, bound: false }

  const variable = await figma.variables.getVariableByIdAsync(bound.id)
  const collection = variable?.variableCollectionId
    ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
    : null
  return { field, value, bound: true, collectionName: collection?.name ?? null }
}

async function walk(node, opts, out) {
  out.push(...(await auditNode(node, opts)))
  if ('children' in node) {
    for (const child of node.children) await walk(child, opts, out)
  }
}

/**
 * @param {{ componentNames?: string[] }} options - named components get a
 *   hard audit (D8, fails loud); omitted -> advisory file-wide sweep of
 *   un-synced frames.
 */
async function runTier0Audit(options = {}) {
  const { componentNames } = options
  const violations = []
  const spacingScale = await collectPrimitivesSpacingScale()
  const semanticModes = await collectSemanticModeNames()

  if (componentNames?.length) {
    for (const name of componentNames) {
      const matches = figma.root.findAll((n) => n.name === name && (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'))
      for (const match of matches) await walk(match, { hard: true, spacingScale, semanticModes }, violations)
    }
  } else {
    for (const page of figma.root.children) {
      for (const topLevel of page.children) await walk(topLevel, { hard: false, spacingScale, semanticModes }, violations)
    }
  }

  // Recipe-owned file-wide check (kit-patches-conformance): runs once per
  // audit, not per node — undefined for a baseSource: none recipe.
  if (typeof runKitPatchesConformance === 'function') {
    const modifiedNodes = await collectModifiedKitCopyNodes()
    violations.push(...runKitPatchesConformance(modifiedNodes))
  }

  return violations
}

/**
 * Recipe-owned file-wide checks (kit-patches-conformance) need the set of
 * kit-copy nodes modified since import, not a per-node predicate — this
 * marshals that set for whichever recipe's runKitPatchesConformance is
 * spliced in above.
 *
 * TODO(figma-sync): a live-Figma-session-only concern (mirrors the existing
 * TODOs in base-congruence.walker.spec-diff.js for CDP-forced pseudo-states)
 * — the concrete "modified since import" signal (a stored per-node
 * content hash compared against kit.lock's syncTimestamp, or an explicit
 * plugin-data dirty marker) is proven at Slice 14's live-file verification,
 * not authored blind here.
 */
async function collectModifiedKitCopyNodes() {
  return []
}

/**
 * D24's scale values come from the project file's local Primitives
 * collection at audit time (Decision 2, semantic-seeding.md) — not a config
 * constant, so this is a live lookup, same shape as collectModifiedKitCopyNodes.
 * Returns [] if no Primitives collection exists yet (unseeded project): the
 * rule then flags every unbound gap/padding value as off-scale rather than
 * throwing — a loud, honest audit failure instead of a crash.
 */
async function collectPrimitivesSpacingScale() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const primitives = collections.find((c) => c.name === 'Primitives')
  if (!primitives) return []

  const values = []
  for (const variableId of primitives.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (!variable) continue
    if (!variable.scopes.includes('GAP') && !variable.scopes.includes('WIDTH_HEIGHT')) continue
    const modeId = primitives.modes[0]?.modeId
    const value = variable.valuesByMode[modeId]
    if (typeof value === 'number') values.push(value)
  }
  return values.sort((a, b) => a - b)
}

/**
 * D11 (generalized to mode copies, 2026-07-05): the mode-copy count is
 * DERIVED from the project's own Semantic collection at audit time, never a
 * hardcoded "Light"/"Dark" pair — `modes[0]` is the default mode the
 * component itself renders in; every mode after it needs a copy. Returns []
 * if the Semantic collection doesn't exist yet (unseeded project), in which
 * case `modeCopyViolations` no-ops (nothing to check yet).
 */
async function collectSemanticModeNames() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const semantic = collections.find((c) => c.name === SEMANTIC_COLLECTION_NAME)
  if (!semantic) return []
  return semantic.modes.map((mode) => mode.name)
}

runTier0Audit
