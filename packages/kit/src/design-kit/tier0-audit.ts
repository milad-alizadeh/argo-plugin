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
 * `options.runGeometryChecks(root)` — the geometry pass extension point
 *   (fidelity-geometry-verifier.md), symmetric with `runRecipeTier0Checks`
 *   but subtree-shaped, not per-node: called once per named-audit root with
 *   the WHOLE marshaled subtree (`marshalGeometryTree`), never in the
 *   file-wide sweep. Omit for a target with no geometry-relevant category —
 *   the guarded call below no-ops and the marshal cost is never paid.
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
  implicitLineHeightViolation,
  storyUrlScopeViolation,
  gapPaddingSpacingViolations,
  isNamedAuditTarget,
  isWireframePageName,
  isDesignPageName,
  strokeScaleViolation,
  possibleGateFalsePositiveTag,
  compositeRegionNamingViolation,
  emDashViolation,
  screenViewportMismatchViolation,
  textTruncationViolation,
  unclippedOverflowViolations
} from './tier0-rules.js'

async function auditNode(
  node: any,
  {
    hard,
    semanticCollectionName = 'Semantic',
    primitivesCollectionName = 'Primitives',
    additionalAllowedCollectionNames = [],
    insideInstance = false,
    compositeNames = [],
    compositeNamingHard = false,
    runRecipeTier0Checks,
    viewport,
    isScreenFrame = false
  }: {
    hard: boolean
    semanticCollectionName?: string
    primitivesCollectionName?: string
    additionalAllowedCollectionNames?: string[]
    insideInstance?: boolean
    compositeNames?: string[]
    compositeNamingHard?: boolean
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    isScreenFrame?: boolean
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
  // Advisory, never hard (live calibration 2026-07-07): `textTruncation:
  // ENDING` is Figma's INTENTIONAL ellipsis setting — tree labels, long
  // session names, and similar deliberately truncate; a live audit found ~65
  // hits, almost all intentional (48 on TreeNode alone). The rule can't tell
  // intentional truncation from an accidental clip, so it flags for review but
  // must not block. The accidental-clip defect it was aimed at (a container
  // clipping its child's text) is a different mechanism, left to the blind
  // fidelity-verifier.
  const truncation = textTruncationViolation(nodeCtx)
  if (truncation)
    violations.push({ severity: 'advisory', rule: truncation.rule, nodeId: node.id, nodeName: node.name, detail: truncation.detail })

  const autoLayout = missingAutoLayoutViolation(nodeCtx)
  if (autoLayout) report(autoLayout.rule, autoLayout.detail)

  const viewportMismatch = screenViewportMismatchViolation(node, { isScreenFrame, viewport })
  if (viewportMismatch) report(viewportMismatch.rule, viewportMismatch.detail)

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
    for (const v of gapPaddingSpacingViolations(
      { type: node.type, layoutMode: node.layoutMode, gapAndPadding, insideInstance },
      { semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames }
    )) {
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

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  // Always advisory regardless of `hard` (same pattern as composite-naming):
  // a style-hygiene nit on authored copy, never a structural defect that
  // should fail a named audit.
  const emDash = emDashViolation(node)
  if (emDash) {
    violations.push({ severity: 'advisory', rule: emDash.rule, nodeId: node.id, nodeName: node.name, detail: emDash.detail })
  }

  // node (not nodeCtx) — needs the real children array with each child's own
  // absoluteBoundingBox/layoutPositioning, which the Proxy already passes
  // through unchanged, so node and nodeCtx are equivalent here; using node
  // directly avoids implying the check depends on insideInstance, which it
  // doesn't. Always advisory regardless of `hard` (same pattern as
  // emDashViolation/compositeNaming).
  for (const overflow of unclippedOverflowViolations(node)) {
    violations.push({ severity: 'advisory', rule: overflow.rule, nodeId: node.id, nodeName: node.name, detail: overflow.detail })
  }

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
    violations.push(...(await runRecipeTier0Checks(node, { hard, insideInstance })))
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
 * Builds ONE plain-object subtree per audited component root, carrying
 * every field the geometry rules read directly off the real Plugin API
 * node (x/y/width/height come from absoluteBoundingBox, already resolved
 * post-layout — no live-measurement round trip needed, unlike the
 * text-clipping gap figma-create's step-4 doc calls out as untestable).
 * Runs once per named-audit root, not per node — the geometry rules
 * consume the WHOLE tree at once (see geometry-rules.ts's doc comment for
 * why a per-node walk can't express sibling/row comparisons).
 */
function marshalGeometryTree(node: any): any {
  const box = node.absoluteBoundingBox ?? {}
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    visible: node.visible,
    opacity: node.opacity,
    clipsContent: node.clipsContent,
    layoutSizingHorizontal: node.layoutSizingHorizontal,
    layoutSizingVertical: node.layoutSizingVertical,
    itemSpacing: node.itemSpacing,
    layoutMode: node.layoutMode,
    fills: node.fills,
    characters: node.type === 'TEXT' ? node.characters : undefined,
    children: (node.children ?? []).map(marshalGeometryTree)
  }
}

/**
 * Rows = the marshaled tree's own direct children that are themselves
 * containers (have children) — the flat per-item unit every list/tree/
 * table/nav category renders. A leaf-only tree (no rows) yields [].
 * Exported for the geometry-checks wiring (Slice 9) to call once and pass
 * to every row-based rule (contentStartAlignmentViolations and friends).
 */
export function marshalRowGroups(tree: any): any[] {
  return (tree.children ?? []).filter((c: any) => (c.children ?? []).length > 0)
}

/**
 * BFS from `tree`, grouping every row (marshalRowGroups' definition — a
 * container child) by its nesting depth (root's direct rows are depth 0,
 * a row's own nested rows are depth 1, etc.) — feeds
 * indentAndRowConsistencyViolations, which needs same-depth siblings
 * compared against each other, never across depths.
 */
export function groupRowsByDepth(tree: any): Map<number, any[]> {
  const byDepth = new Map<number, any[]>()
  const walk = (node: any, depth: number) => {
    const rows = marshalRowGroups(node)
    if (rows.length > 0) byDepth.set(depth, [...(byDepth.get(depth) ?? []), ...rows])
    for (const row of rows) walk(row, depth + 1)
  }
  walk(tree, 0)
  return byDepth
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
    const childOpts = {
      ...opts,
      isScreenFrame: false,
      insideInstance: node.type === 'INSTANCE' ? true : opts.insideInstance
    }
    for (const child of node.children) await walk(child, childOpts, out)
  }
}

/**
 * `options`: `componentNodeIds`/`componentNames` get a hard audit (D8, fails
 * loud) when set; omitted -> advisory file-wide sweep of un-synced frames.
 * `componentNodeIds` is the authoritative target list — real Figma nodeIds
 * resolved Node-side (by `prepare-tier0-audit-options.js`) against
 * `design/registry.json`, never matched by name here. `componentNames` is
 * ONLY a fallback for a target with no registry entry (e.g. an unregistered
 * foundation frame/SCREEN) — resolved to a nodeId by an unambiguous
 * single-match name lookup; an ambiguous name (more than one same-named
 * node, or zero) reports `ambiguous-audit-target-name` instead of silently
 * sweeping every match (the exact field bug this fixed: auditing "Card" used
 * to also sweep a container frame literally named "Card").
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
    componentNodeIds?: string[]
    componentNames?: string[]
    compositeNames?: string[]
    compositeNamingHard?: boolean
    semanticCollectionName?: string
    primitivesCollectionName?: string
    additionalAllowedCollectionNames?: string[]
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    runGeometryChecks?: (root: any) => any[]
  } = {}
) {
  const {
    componentNodeIds = [],
    componentNames = [],
    compositeNames = [],
    compositeNamingHard = false,
    semanticCollectionName = 'Semantic',
    primitivesCollectionName = 'Primitives',
    additionalAllowedCollectionNames = [],
    runRecipeTier0Checks,
    viewport,
    runGeometryChecks
  } = options
  const violations: any[] = []

  if (componentNodeIds.length || componentNames.length) {
    // Dynamic-page mode requires every page loaded before figma.root.findAll
    // can see nodes outside the currently-open page. loadAllPagesAsync is not
    // available in the use_figma sandbox — fall back to already-loaded pages
    // (callers there run the audit from the page the components live on).
    try {
      await figma.loadAllPagesAsync()
    } catch {
      /* sandbox: figma.root.findAll sees only loaded pages */
    }
    const walkOpts = { hard: true, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames, compositeNames, compositeNamingHard, runRecipeTier0Checks, viewport }

    // Authoritative path (field bug fix, 2026-07-07 live D01 build): target
    // by the registry's real nodeId, resolved by the caller Node-side before
    // this call ever runs — `getNodeByIdAsync` is unambiguous, unlike a
    // name-based sweep, which matched every same-named node in the file
    // (auditing "Card" also swept a container frame literally named "Card" —
    // ~49 foreign violations from kit page furniture that shares the
    // component's name but isn't it).
    for (const nodeId of componentNodeIds) {
      const match = await figma.getNodeByIdAsync(nodeId)
      if (!match) {
        violations.push({ severity: 'hard', rule: 'audit-target-not-found', nodeId, nodeName: null, detail: `no node resolves to nodeId "${nodeId}" — the registry entry may be stale` })
        continue
      }
      const owningPageName = findOwningPage(match)?.name ?? ''
      if (isWireframePageName(owningPageName)) continue
      await walk(match, { ...walkOpts, isScreenFrame: isDesignPageName(owningPageName) }, violations)
      if (typeof runGeometryChecks === 'function') {
        violations.push(...runGeometryChecks(marshalGeometryTree(match)))
      }
    }

    // Name-resolution fallback (ONLY for a target with no registry nodeId —
    // e.g. a foundation frame/SCREEN never entered into design/registry.json).
    // A name lookup resolves TO a nodeId here, confirmed by requiring an
    // UNAMBIGUOUS single match — never a blind multi-node sweep, which is
    // exactly the bug this fallback must not reintroduce.
    for (const name of componentNames) {
      const matches = figma.root.findAll((n: any) => isNamedAuditTarget(n, name))
      if (matches.length !== 1) {
        violations.push({
          severity: 'hard',
          rule: 'ambiguous-audit-target-name',
          nodeId: null,
          nodeName: name,
          detail: `name "${name}" resolved to ${matches.length} node(s), not exactly 1 — register it in design/registry.json and target it by nodeId instead of by name`
        })
        continue
      }
      const match = matches[0]
      const owningPageName = findOwningPage(match)?.name ?? ''
      if (isWireframePageName(owningPageName)) continue
      await walk(match, { ...walkOpts, isScreenFrame: isDesignPageName(owningPageName) }, violations)
      if (typeof runGeometryChecks === 'function') {
        violations.push(...runGeometryChecks(marshalGeometryTree(match)))
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
        await walk(
          topLevel,
          {
            hard: false,
            semanticCollectionName,
            primitivesCollectionName,
            additionalAllowedCollectionNames,
            compositeNames,
            compositeNamingHard,
            runRecipeTier0Checks,
            viewport,
            isScreenFrame: isDesignPageName(page.name)
          },
          violations
        )
      }
    }
  }

  return violations
}

