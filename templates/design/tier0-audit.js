/**
 * Canonical tier-0 Figma hygiene audit (figma-to-code-pipeline.md §5 tier 0).
 *
 * Owned by /argo:figma-audit (X3) — /argo:figma-sync and /argo:figma-create
 * call this SAME script; do not fork a second copy. Executed inside Figma's
 * Plugin API sandbox via the `use_figma` tool — it cannot be unit-tested
 * outside Figma, see the design-pack plan's risks/open-questions section.
 *
 * {{SEMANTIC_COLLECTION_NAME}} — this project's Semantic variable collection
 *   name (e.g. "Semantic"), filled by /argo:setup-design from design/config.json.
 * {{KIT_LIBRARY_FILE_KEY}} — the published kit library's Figma file key, used
 *   to distinguish kit-sourced variables/components from project-local ones
 *   and to flag bindings still resolving to a retired kit copy (D15 paired
 *   upgrades).
 *
 * Reports violations as { severity: 'hard' | 'advisory', rule, nodeId, nodeName, detail }.
 * `hard` fails the calling skill loud (D8); `advisory` is a file-wide sweep
 * finding surfaced but not blocking (e.g. un-synced frames).
 */

const SEMANTIC_COLLECTION_NAME = '{{SEMANTIC_COLLECTION_NAME}}'
const KIT_LIBRARY_FILE_KEY = '{{KIT_LIBRARY_FILE_KEY}}'

async function auditNode(node, { hard }) {
  const violations = []

  const report = (rule, detail) => {
    violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail })
  }

  // Unbound fills/strokes/radii/type — every visual constant must trace to a
  // variable, never a literal (mirrors this repo's own design-system rule).
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && !fill.boundVariables?.color) {
        report('unbound-fill', 'solid fill has no bound color variable')
      }
    }
  }
  if ('strokes' in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && !stroke.boundVariables?.color) {
        report('unbound-stroke', 'solid stroke has no bound color variable')
      }
    }
  }
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number' && !node.boundVariables?.cornerRadius) {
    report('unbound-radius', 'cornerRadius has no bound variable')
  }
  if ('fontName' in node && !node.boundVariables?.fontSize) {
    report('unbound-type', 'text node font size has no bound variable')
  }

  // Non-Semantic bindings, distinguished by library source (§8's library-source
  // distinction): project components must bind the Semantic collection only;
  // base/kit components legitimately bind kit variables directly.
  const boundVars = node.boundVariables ? Object.values(node.boundVariables) : []
  for (const bound of boundVars) {
    const alias = Array.isArray(bound) ? bound[0] : bound
    if (!alias?.id) continue
    const variable = await figma.variables.getVariableByIdAsync(alias.id)
    if (!variable) continue
    const isKitSourced = variable.remote && variable.key?.startsWith(KIT_LIBRARY_FILE_KEY)
    const isSemantic = variable.variableCollectionId && !isKitSourced
    if (!isKitSourced && !isSemantic) {
      report('non-semantic-binding', `bound to a non-${SEMANTIC_COLLECTION_NAME} variable outside the kit library`)
    }
  }

  // Missing Auto Layout on frame-like containers.
  if ((node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') && node.layoutMode === 'NONE') {
    report('missing-auto-layout', 'frame-like node has no Auto Layout')
  }

  // Detached instances — an INSTANCE whose mainComponent no longer resolves.
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync()
    if (!main) report('detached-instance', 'instance has no resolvable main component')
  }

  // Non-semantic names — reject Figma's auto-generated defaults.
  if (/^(Frame|Group|Rectangle|Ellipse|Text|Vector)\s?\d*$/.test(node.name)) {
    report('non-semantic-name', `node name "${node.name}" looks auto-generated, not semantic`)
  }

  // D18 variant naming: Figma property `Size` -> prop `size`; Title-Case
  // variant values -> lowercase literal unions.
  if (node.type === 'COMPONENT_SET') {
    for (const propName of Object.keys(node.componentPropertyDefinitions ?? {})) {
      if (propName[0] !== propName[0].toLowerCase()) {
        report('variant-naming', `variant property "${propName}" should be lowercase (D18)`)
      }
    }
  }

  // D11: components need a visible dark-mode instance copy directly beneath,
  // with the Semantic collection's mode explicitly set to Dark.
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const darkCopy = node.parent?.children?.find(
      (sibling) => sibling !== node && sibling.name === `${node.name} (Dark)`
    )
    if (!darkCopy) {
      report('missing-dark-copy', 'component has no adjacent dark-mode instance copy (D11)')
    } else if (darkCopy.explicitVariableModes?.[SEMANTIC_COLLECTION_NAME] == null) {
      report('incorrect-dark-copy', 'dark copy does not set the Semantic collection mode explicitly')
    }
  }

  // D20: line-height must be explicit, never Figma's implicit "Auto".
  if ('lineHeight' in node && node.lineHeight?.unit === 'AUTO') {
    report('implicit-line-height', 'text node uses implicit AUTO line-height; must be explicit (D20)')
  }

  // D1: story URLs on components must be node-scoped (?node-id=), not file-level.
  if (node.type === 'COMPONENT' && node.getPluginDataKeys().includes('storyUrl')) {
    const storyUrl = node.getPluginData('storyUrl')
    if (storyUrl && !storyUrl.includes('node-id=')) {
      report('non-node-scoped-story-url', `storyUrl "${storyUrl}" is not node-scoped`)
    }
  }

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
