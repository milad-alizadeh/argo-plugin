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
 * --- RECIPE-CHECKS INJECTION REGION ---
 * /argo:setup-design splices the installed recipe's tier0-recipe-checks.js
 * import + call into the marked region below, so the host project always
 * runs ONE assembled canonical script (X3/F12) — never two separately-
 * executed audit scripts. When no recipe is installed (baseSource: none),
 * the region is left empty.
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
  darkCopyViolation,
  implicitLineHeightViolation,
  storyUrlScopeViolation
} from 'figma-design-kit'

const SEMANTIC_COLLECTION_NAME = '{{SEMANTIC_COLLECTION_NAME}}'

// --- RECIPE-CHECKS INJECTION REGION: imports ---
// import { runRecipeTier0Checks } from './tier0-recipe-checks.js'
// --- end region ---

async function auditNode(node, { hard }) {
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
    const darkCopy = darkCopyViolation({ type: node.type, name: node.name, siblings }, SEMANTIC_COLLECTION_NAME)
    if (darkCopy) report(darkCopy.rule, darkCopy.detail)
  }

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  if (node.type === 'COMPONENT' && node.getPluginDataKeys().includes('storyUrl')) {
    const storyUrl = node.getPluginData('storyUrl')
    const storyScope = storyUrlScopeViolation({ type: node.type, storyUrl })
    if (storyScope) report(storyScope.rule, storyScope.detail)
  }

  // --- RECIPE-CHECKS INJECTION REGION: per-node call ---
  // violations.push(...(await runRecipeTier0Checks(node, { hard })))
  // --- end region ---

  return violations
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

  if (componentNames?.length) {
    for (const name of componentNames) {
      const matches = figma.root.findAll((n) => n.name === name && (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'))
      for (const match of matches) await walk(match, { hard: true }, violations)
    }
  } else {
    for (const page of figma.root.children) {
      for (const topLevel of page.children) await walk(topLevel, { hard: false }, violations)
    }
  }

  return violations
}

runTier0Audit
