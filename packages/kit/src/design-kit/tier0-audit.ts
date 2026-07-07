/**
 * Canonical tier-0 Figma hygiene audit (figma-to-code-pipeline.md §5 tier 0).
 *
 * Owned by /argo:figma-audit (X3) — /argo:figma-sync and /argo:figma-create
 * call this SAME function; there is exactly one copy of this logic. This is
 * a thin Plugin-API walker: it marshals live `figma.*` node/variable objects
 * into plain-object shapes and delegates the actual rule logic to this
 * package's unit-tested pure functions (./tier0-rules.js).
 *
 * Config-as-data (kit-extraction restructure): every project-specific value
 * this mechanism needs — the Semantic collection name, and the recipe
 * extension point below — arrives through `options`, never through a
 * splice/placeholder step baked into a committed copy. `bundle-tier0-audit`
 * (skill-scripts) generates a small entry module that imports this function
 * plus whichever recipe's check functions and bakes them into the bundle
 * `use_figma` runs; DATA (the Semantic collection name) still flows through
 * `options` at call time — see prepare-tier0-audit-options.js.
 *
 * `options.runRecipeTier0Checks(node, { hard })` — recipe-owned per-node
 *   checks (e.g. non-semantic-binding). Omit for a recipe with no checks —
 *   the guarded call below no-ops.
 *
 * Reports violations as { severity: 'hard' | 'advisory', rule, nodeId, nodeName, detail }.
 * `hard` fails the calling skill loud (D8); `advisory` is a file-wide sweep
 * finding surfaced but not blocking (e.g. un-synced frames).
 *
 * Cannot be unit-tested outside Figma's Plugin API sandbox (design-pack plan
 * §6, risk 1; documented accepted gap) — the `options`-passing plumbing
 * around it (semanticCollectionName threading, recipe-hook wiring) is
 * exercised by prepare-tier0-audit-options.test.js and
 * bundle-tier0-audit.test.js instead of a synthetic Figma harness here.
 *
 * This file runs exclusively inside Figma's `use_figma` Plugin API sandbox,
 * where a global `figma` object is injected at runtime — no `@figma/plugin-typings`
 * dependency is pulled in for this migration; the global is declared `any`
 * locally, matching the pragmatic (not fully domain-modeled) typing used
 * throughout this package's Figma node/variable shapes.
 */
declare const figma: any

import {
  unboundFillViolations,
  unboundStrokeViolations,
  unboundRadiusViolation,
  unboundTypeViolation,
  missingAutoLayoutViolation,
  handDrawnIconViolation,
  kitInstanceOverrideViolation,
  detachedInstanceViolation,
  nonSemanticNameViolation,
  variantNamingViolations,
  modeCopyViolations,
  implicitLineHeightViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations,
  isNamedAuditTarget,
  isWireframePageName,
  strokeScaleViolation,
  possibleGateFalsePositiveTag,
  compositeRegionNamingViolation
} from './tier0-rules.js'

async function auditNode(
  node: any,
  {
    hard,
    spacingScale,
    semanticModes,
    semanticCollectionName,
    insideInstance = false,
    compositeNames = [],
    compositeNamingHard = false,
    runRecipeTier0Checks
  }: {
    hard: boolean
    spacingScale: number[]
    semanticModes: string[]
    semanticCollectionName: string
    insideInstance?: boolean
    compositeNames?: string[]
    compositeNamingHard?: boolean
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean }) => Promise<any[]>
  }
) {
  const violations: any[] = []

  // Fetched early (rather than inside the INSTANCE-only block below) so the
  // R8 false-positive tag can see it before any violation is reported.
  const main = node.type === 'INSTANCE' ? await node.getMainComponentAsync() : null
  // `overrides` exists only on INSTANCE nodes — reading it on any other type
  // throws in the use_figma sandbox (confirmed live 2026-07-05: crashed every
  // named audit of a COMPONENT_SET).
  const overriddenFields =
    node.type === 'INSTANCE' ? (node.overrides ?? []).flatMap((o: any) => o.overriddenFields ?? []) : []

  // R8: a node that resolves to a kit main component (a remote instance, or
  // a node inside one) whose only overrides are size/fill/stroke is
  // presumptively a GATE BUG, not a real hygiene defect — tag every
  // violation reported for it `possible-gate-false-positive` so the
  // designer/reviewer never has to self-grade that judgment (agents/
  // designer.md's ICONS section states this never licenses detaching).
  const falsePositiveTag = possibleGateFalsePositiveTag({
    isRemoteInstance: Boolean(main?.remote),
    insideInstance,
    overriddenFields
  })
  const report = (rule: string, detail: string) => {
    violations.push({
      severity: hard ? 'hard' : 'advisory',
      rule,
      nodeId: node.id,
      nodeName: node.name,
      detail,
      ...(falsePositiveTag ? { tag: 'possible-gate-false-positive — does NOT license detaching' } : {})
    })
  }

  // Rule functions that read `node.insideInstance` (the kit-internals
  // exemption, 2026-07-05) need it MARSHALED onto the node they're called
  // with — `insideInstance` is an opts-only value the real Plugin-API node
  // never carries as a property. `nodeCtx` prototype-delegates to the real
  // node (so every existing property/getter access on it still works) and
  // adds `insideInstance` on top. Fix (live D01 build): unbound-fill/stroke/
  // radius/type and missing-auto-layout were previously called with the bare
  // node, so this exemption silently never fired for them, and a pristine
  // kit instance (e.g. Switch) hard-failed on its own internal frames.
  // A get-only Proxy, NOT Object.create/assign — the sandbox node is itself
  // a Proxy whose set trap rejects unknown properties even via a derived
  // object (confirmed live 2026-07-05, threw on COMPONENT_SET). Rule
  // functions only ever READ nodeCtx.
  const nodeCtx = new Proxy(node, {
    get: (target: any, prop: string) => (prop === 'insideInstance' ? insideInstance : target[prop])
  })

  for (const v of unboundFillViolations(nodeCtx)) report(v.rule, v.detail)
  for (const v of unboundStrokeViolations(nodeCtx)) report(v.rule, v.detail)
  const radius = unboundRadiusViolation(nodeCtx)
  if (radius) report(radius.rule, radius.detail)
  const type = unboundTypeViolation(nodeCtx)
  if (type) report(type.rule, type.detail)

  const autoLayout = missingAutoLayoutViolation(nodeCtx)
  if (autoLayout) report(autoLayout.rule, autoLayout.detail)

  const handDrawnIcon = handDrawnIconViolation({ type: node.type, insideInstance })
  if (handDrawnIcon) report(handDrawnIcon.rule, handDrawnIcon.detail)

  if ('layoutMode' in node) {
    const gapAndPadding = []
    const fields = node.layoutMode === 'NONE'
      ? ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
      : ['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
    for (const field of fields) {
      if (!(field in node)) continue
      gapAndPadding.push(await marshalGapPaddingField(node, field))
    }
    for (const v of gapPaddingSpacingViolations({ type: node.type, layoutMode: node.layoutMode, gapAndPadding, insideInstance }, spacingScale)) {
      report(v.rule, v.detail)
    }
  }

  if (node.type === 'INSTANCE') {
    const detached = detachedInstanceViolation({ type: node.type, hasMainComponent: Boolean(main) })
    if (detached) report(detached.rule, detached.detail)

    const kitOverride = kitInstanceOverrideViolation({
      type: node.type,
      isRemoteInstance: Boolean(main?.remote),
      overriddenFields
    })
    if (kitOverride) report(kitOverride.rule, kitOverride.detail)

    if (main?.remote) {
      // ADVISORY + top-level only (demoted 2026-07-05 after the first live
      // sweep): nested kit-icon instances inside kit/authored instances
      // re-flag the same glyph at every nesting level with unreliable
      // native-size readings — per R10's false-positive economics this rule
      // stays advisory until the corpus calibrates it; it never hard-fails.
      if (!insideInstance) {
        const strokeScaleShape = marshalIconStrokeScale(node, main)
        if (strokeScaleShape) {
          const strokeScale = strokeScaleViolation(strokeScaleShape)
          if (strokeScale) {
            violations.push({
              severity: 'advisory',
              rule: strokeScale.rule,
              nodeId: node.id,
              nodeName: node.name,
              detail: strokeScale.detail
            })
          }
        }
      }
    }
  }

  const nonSemanticName = nonSemanticNameViolation(nodeCtx)
  if (nonSemanticName) report(nonSemanticName.rule, nonSemanticName.detail)

  // Composite-naming check. Supersedes the earlier "ALWAYS advisory" Option-B
  // ruling (design-first-council-ruling.md): the mechanism now RESPECTS a hard
  // flag so it can protect the components-first guarantee (design-process-
  // simplification.md). It stays advisory by DEFAULT (`compositeNamingHard`
  // false) until one NEW-composite wave calibrates the wrapper-frame exemption;
  // flip the default (or wire `prepare-tier0-audit-options` to pass true) after
  // that. Only a NAMED (hard) audit can escalate it — a file-wide sweep is
  // always advisory.
  const compositeNaming = compositeRegionNamingViolation(node, compositeNames)
  if (compositeNaming) {
    violations.push({
      severity: hard && compositeNamingHard ? 'hard' : 'advisory',
      rule: compositeNaming.rule,
      nodeId: node.id,
      nodeName: node.name,
      detail: compositeNaming.detail
    })
  }

  for (const v of variantNamingViolations(node)) report(v.rule, v.detail)

  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const siblings = (node.parent?.children ?? []).filter((sibling: any) => sibling !== node)
    for (const v of modeCopyViolations({ type: node.type, name: node.name, siblings }, semanticCollectionName, semanticModes)) {
      report(v.rule, v.detail)
    }
  }

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  // getPluginData/getPluginDataKeys are unavailable in the use_figma sandbox
  // (private-plugin-only API) — storyUrl lives in shared plugin data, with a
  // guarded private-data fallback for files stamped by older syncs.
  if (node.type === 'COMPONENT') {
    let storyUrl = node.getSharedPluginData('argo', 'storyUrl')
    if (!storyUrl) {
      try {
        storyUrl = node.getPluginDataKeys().includes('storyUrl') ? node.getPluginData('storyUrl') : ''
      } catch {
        storyUrl = ''
      }
    }
    if (storyUrl) {
      const storyScope = storyUrlScopeViolation({ type: node.type, storyUrl })
      if (storyScope) report(storyScope.rule, storyScope.detail)
    }
  }

  // Recipe-owned per-node checks (e.g. non-semantic-binding) — undefined for
  // a recipe with no checks.
  if (typeof runRecipeTier0Checks === 'function') {
    violations.push(...(await runRecipeTier0Checks(node, { hard })))
  }

  return violations
}

/**
 * Marshals the plain shape `strokeScaleViolation` (NEW-3) checks over, for an
 * icon-like remote instance: a component whose main is a single-VECTOR
 * component (a lucide icon — a frame wrapping exactly one VECTOR child,
 * `layoutMode: 'NONE'`, observed live). Returns null for any remote instance
 * that doesn't match that shape (a non-icon kit component) — the caller only
 * runs the rule when this returns a shape.
 */
function marshalIconStrokeScale(node: any, main: any) {
  const vectorChildren = (main.children ?? []).filter((c: any) => c.type === 'VECTOR')
  if ((main.children ?? []).length !== 1 || vectorChildren.length !== 1) return null
  const vector = vectorChildren[0]
  const baseStrokeWeight = vector.strokeWeight
  const resolvedStrokeWeight = typeof node.strokeWeight === 'number' ? node.strokeWeight : vector.strokeWeight
  if (typeof baseStrokeWeight !== 'number' || typeof resolvedStrokeWeight !== 'number') return null
  if (typeof main.width !== 'number' || typeof node.width !== 'number') return null
  return { instanceSize: node.width, nativeSize: main.width, resolvedStrokeWeight, baseStrokeWeight }
}

/**
 * Marshals a single Auto Layout gap/padding field (D24). boundVariables for a
 * number property is a single { id } object, not an array (unlike fills/
 * strokes) — resolved and marshaled explicitly, field by field, same
 * convention as the recipe tier0 walker (remote/key/variableCollectionId are
 * prototype getters, not own properties, so never spread a live Variable).
 */
async function marshalGapPaddingField(node: any, field: string) {
  const value = node[field]
  const bound = node.boundVariables?.[field]
  if (!bound?.id) return { field, value, bound: false }

  const variable = await figma.variables.getVariableByIdAsync(bound.id)
  const collection = variable?.variableCollectionId
    ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
    : null
  return { field, value, bound: true, collectionName: collection?.name ?? null }
}

/**
 * Named-audit mode (figma.root.findAll) can match a node anywhere in the
 * file, including on a wireframe page — walk up its parent chain to find
 * the owning PAGE so the wireframe-page exemption applies there too.
 */
function findOwningPage(node: any) {
  let current = node
  while (current && current.type !== 'PAGE') current = current.parent
  return current ?? null
}

async function walk(node: any, opts: any, out: any[]) {
  out.push(...(await auditNode(node, opts)))
  if ('children' in node) {
    const childOpts =
      node.type === 'INSTANCE' && !opts.insideInstance ? { ...opts, insideInstance: true } : opts
    for (const child of node.children) await walk(child, childOpts, out)
  }
}

/**
 * `options`: `componentNames`/`compositeNames` get a hard audit (D8, fails
 * loud) when set; omitted -> advisory file-wide sweep of un-synced frames.
 * `compositeNames` — the project's registered composite names
 * (`design/registry.json`'s keys), derived Node-side by
 * `prepare-tier0-audit-options.js` before this call — feeds
 * `compositeRegionNamingViolation` (Option B, always advisory).
 * `semanticCollectionName` defaults to `'Semantic'`. `runRecipeTier0Checks`
 * is the recipe's extension point, baked into the bundle by
 * `bundle-tier0-audit`'s generated entry — omit it for a recipe with no
 * checks.
 */
export async function runTier0Audit(
  options: {
    componentNames?: string[]
    compositeNames?: string[]
    compositeNamingHard?: boolean
    semanticCollectionName?: string
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean }) => Promise<any[]>
  } = {}
) {
  const {
    componentNames,
    compositeNames = [],
    compositeNamingHard = false,
    semanticCollectionName = 'Semantic',
    runRecipeTier0Checks
  } = options
  const violations: any[] = []
  const spacingScale = await collectPrimitivesSpacingScale()
  const semanticModes = await collectSemanticModeNames(semanticCollectionName)

  if (componentNames?.length) {
    // Dynamic-page mode requires every page loaded before figma.root.findAll
    // can see nodes outside the currently-open page. loadAllPagesAsync is not
    // available in the use_figma sandbox — fall back to already-loaded pages
    // (callers there run the audit from the page the components live on).
    try {
      await figma.loadAllPagesAsync()
    } catch {
      /* sandbox: figma.root.findAll sees only loaded pages */
    }
    for (const name of componentNames) {
      const matches = figma.root.findAll((n: any) => isNamedAuditTarget(n, name))
      for (const match of matches) {
        if (isWireframePageName(findOwningPage(match)?.name ?? '')) continue
        await walk(match, { hard: true, spacingScale, semanticModes, semanticCollectionName, compositeNames, compositeNamingHard, runRecipeTier0Checks }, violations)
      }
    }
  } else {
    for (const page of figma.root.children) {
      // Wireframe-page exemption (figma-wireframe/SKILL.md): wireframe
      // surface pages (`W<NN> <group>`) and `Cover` are never code-synced,
      // so ALL tier-0 checks are skipped for their nodes, not just fill/
      // stroke — the whole gate is exempt, per the skill's documented
      // wording.
      if (isWireframePageName(page.name)) continue
      for (const topLevel of page.children) {
        await walk(topLevel, { hard: false, spacingScale, semanticModes, semanticCollectionName, compositeNames, compositeNamingHard, runRecipeTier0Checks }, violations)
      }
    }
  }

  return violations
}

/**
 * Retained for signature compatibility with gapPaddingSpacingViolations,
 * which no longer consumes a spacing scale (D24, revised 2026-07-05: every
 * non-zero gap/padding field must be bound, so there is no more on-scale/
 * off-scale literal distinction to check against). Still a live lookup of
 * the project file's local Primitives collection; returns [] if no
 * Primitives collection exists yet (unseeded project).
 */
async function collectPrimitivesSpacingScale(): Promise<number[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const primitives = collections.find((c: any) => c.name === 'Primitives')
  if (!primitives) return []

  const values: number[] = []
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
 * if the Semantic collection (named `semanticCollectionName`) doesn't exist
 * yet (unseeded project), in which case `modeCopyViolations` no-ops (nothing
 * to check yet).
 */
async function collectSemanticModeNames(semanticCollectionName: string): Promise<string[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const semantic = collections.find((c: any) => c.name === semanticCollectionName)
  if (!semantic) return []
  return semantic.modes.map((mode: any) => mode.name)
}
