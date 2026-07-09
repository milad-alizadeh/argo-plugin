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
 * Universal per-node a11y/overflow checks (hug-overflow, touch-target on
 * nodes with prototype reactions, WCAG text contrast via the `wcag-contrast`
 * package) run on EVERY audited node — no role tags, no category config;
 * the contrast check resolves a text node's background deterministically
 * (nearest fully-opaque solid ancestor fill, threaded down the walk) and
 * SKIPS when it can't, never guesses.
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
  textStyleRequiredViolation,
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
  unclippedOverflowViolations,
  hugOverflowViolations,
  touchTargetViolation,
  textContrastViolation,
  untracedCopyViolation
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
    isScreenFrame = false,
    ancestorSolidFill = null,
    copyAllowedStrings = null
  }: {
    hard: boolean
    semanticCollectionName?: string
    primitivesCollectionName?: string
    additionalAllowedCollectionNames?: string[]
    insideInstance?: boolean
    compositeNames?: string[]
    compositeNamingHard?: boolean
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean; isScreenFrame?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    isScreenFrame?: boolean
    ancestorSolidFill?: any
    copyAllowedStrings?: string[] | null
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
    get: (target: any, prop: string) =>
      prop === 'insideInstance'
        ? insideInstance
        : prop === 'ancestorSolidFill'
          ? ancestorSolidFill
          : prop === 'isScreenFrame'
            ? isScreenFrame
            : target[prop]
  })

  for (const v of unboundFillViolations(nodeCtx)) report(v.rule, v.detail)
  for (const v of unboundStrokeViolations(nodeCtx)) report(v.rule, v.detail)
  const radius = unboundRadiusViolation(nodeCtx)
  if (radius) report(radius.rule, radius.detail)
  const type = textStyleRequiredViolation(nodeCtx)
  if (type) report(type.rule, type.detail)
  // Universal per-node a11y/overflow checks (no tags, no config — folded in
  // from the retired geometry layer; only the genuinely component-agnostic
  // subset survived).
  for (const v of hugOverflowViolations(nodeCtx)) report(v.rule, v.detail)
  const touchTarget = touchTargetViolation(nodeCtx)
  if (touchTarget) report(touchTarget.rule, touchTarget.detail)
  const contrast = textContrastViolation(nodeCtx)
  if (contrast) report(contrast.rule, contrast.detail)
  // Rule #13 (untraced-copy, W4): hard on named audits via report(); inert
  // when no copy deck is in play (copyAllowedStrings null — see
  // prepare-tier0-audit-options). Called with nodeCtx so the rule can read
  // insideInstance if its exemption policy ever changes; today it deliberately
  // audits instance internals too (documented on the rule).
  const untracedCopy = untracedCopyViolation(nodeCtx, { copyAllowedStrings })
  if (untracedCopy) report(untracedCopy.rule, untracedCopy.detail)
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

    // Any resolvable main, remote OR local — the earlier `main?.remote` gate
    // meant the check never ran in a duplicated-starter file (all icon mains
    // are local there), which let 85 non-proportional icon strokes accumulate
    // undetected. Hard on named audits (via report). Top-level only: nested
    // kit-icon instances re-flag the same glyph at every nesting level with
    // unreliable native-size readings.
    if (main && !insideInstance) {
      const strokeScaleShape = marshalIconStrokeScale(node, main)
      if (strokeScaleShape) {
        const strokeScale = strokeScaleViolation(strokeScaleShape)
        if (strokeScale) report(strokeScale.rule, strokeScale.detail)
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
    violations.push(...(await runRecipeTier0Checks(node, { hard, insideInstance, isScreenFrame })))
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
  // the rendered stroke lives on the INSTANCE's own vector child (a per-
  // instance strokeWeight override is exactly the proportional-stroke fix),
  // never on node.strokeWeight — that is the instance frame's own stroke
  // property — and never on the main's vector, which stays at native weight
  const instanceVector = (node.children ?? []).find((c: any) => c.type === 'VECTOR')
  const resolvedStrokeWeight = typeof instanceVector?.strokeWeight === 'number' ? instanceVector.strokeWeight : null
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
    // Nearest fully-opaque solid fill wins — feeds textContrastViolation's
    // deterministic background resolution; anything ambiguous (mixed fills,
    // translucency) leaves the inherited value, and the rule itself skips
    // when even that is absent.
    const ownSolid = Array.isArray(node.fills)
      ? node.fills.find((f: any) => f?.type === 'SOLID' && f.visible !== false && (f.opacity ?? 1) >= 1)
      : undefined
    const childOpts = {
      ...opts,
      isScreenFrame: false,
      insideInstance: node.type === 'INSTANCE' ? true : opts.insideInstance,
      ancestorSolidFill: ownSolid ?? opts.ancestorSolidFill ?? null
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
    runRecipeTier0Checks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean; isScreenFrame?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    pageId?: string
    sweepNodeIds?: string[]
    sweepPageNames?: string[]
    screenNodeIds?: string[]
    copyAllowedStrings?: string[] | null
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
    pageId,
    sweepNodeIds = [],
    sweepPageNames = [],
    screenNodeIds = [],
    copyAllowedStrings = null
  } = options
  const violations: any[] = []
  // Screen identity is registry-driven (design/registry.json entries with
  // kind:"screen", resolved Node-side by prepare-tier0-audit-options): a
  // top-level artboard is a screen frame iff its nodeId is registered as one.
  // Replaces the old isDesignPageName(pageName) heuristic, which never armed on
  // a project whose screens live on a page NOT named `D<NN> ...` (e.g. a
  // "Screens" catch-all page).
  const screenNodeIdSet = new Set(screenNodeIds)
  // A top-level frame is a screen either by registry membership (Node-side
  // derived, fast) OR by carrying a live `@screen` Dev Mode annotation on the
  // canvas — the latter is the human/AI-facing marker (frames have no
  // `description`, unlike code-owned components, so the annotation layer is
  // where the marker lives) and makes a hand-annotated screen audit correctly
  // BEFORE any registry sync. Mirrors the code-owned marker→registry model.
  const hasScreenAnnotation = (n: any) =>
    Array.isArray(n?.annotations) &&
    n.annotations.some((a: any) => /@screen\b/.test(a?.label ?? '') || /@screen\b/.test(a?.labelMarkdown ?? ''))
  const isScreenTopLevel = (match: any) =>
    match?.parent?.type === 'PAGE' && (screenNodeIdSet.has(match.id) || hasScreenAnnotation(match))

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
    const walkOpts = { hard: true, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames, compositeNames, compositeNamingHard, runRecipeTier0Checks, viewport, copyAllowedStrings }

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
      // isScreenFrame only when `match` is genuinely the page's top-level
      // frame (parent IS the page) — a registry nodeId can resolve to a node
      // NESTED under a design page, which must still be name/viewport-gated.
      await walk(match, { ...walkOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
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
      // isScreenFrame only when `match` is genuinely the page's top-level
      // frame (parent IS the page) — a registry nodeId can resolve to a node
      // NESTED under a design page, which must still be name/viewport-gated.
      await walk(match, { ...walkOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
    }
  } else if (pageId) {
    // Legacy single-page whole-page walk — explicit opt-in only, reachable
    // ONLY when a caller passes `pageId` (D25, 2026-07-08). This is no
    // longer reachable as a silent fallback: the scoped-sweep branch below
    // is now the sole default whenever neither a named audit nor `pageId` is
    // requested, so an empty/misconfigured `sweepNodeIds`/`sweepPageNames`
    // can never accidentally degrade into a whole-file walk (council-review
    // finding, 2026-07-08 — the previous `else if (sweepNodeIds.length ||
    // sweepPageNames.length) ... else { legacy }` gate silently fell through
    // to this branch whenever both scoped inputs resolved empty).
    const page = await figma.getNodeByIdAsync(pageId)
    if (page && !isWireframePageName(page.name)) {
      await figma.setCurrentPageAsync(page)
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
            copyAllowedStrings,
            isScreenFrame: isScreenTopLevel(topLevel)
          },
          violations
        )
      }
    }
  } else {
    // Scoped sweep (D26, 2026-07-08) — the sole DEFAULT file-wide sweep path
    // now: every registry-listed component (`sweepNodeIds`, derived by
    // `prepare-tier0-audit-options.js` from ALL of `design/registry.json` —
    // kit or custom, no exemption) plus every composed-screen page. A page
    // is in scope when it matches the project's real `D<NN> <group>` screen
    // convention (`isDesignPageName`, file-structure.md) OR is explicitly
    // named in `sweepPageNames` (additive — e.g. a project with a literal
    // "Screens" catch-all page, or any other non-`D<NN>` convention it wants
    // included). Matching by `isDesignPageName` unconditionally (not gating
    // the whole branch on `sweepPageNames` being non-empty) fixes a council-
    // review finding: the earlier default `sweepPageNames: ['Screens']`
    // matched a literal page named "Screens", which does not exist in this
    // project's convention of one page per screen (`D01 Onboarding`, `D02
    // Home`, ...) — so the "screens" half of the sweep silently matched zero
    // pages. Kit primitive pages, demo/example pages, and icon libraries
    // stay out of scope: almost entirely stock content nobody in the project
    // touched, and on a 50+ page file, large enough to risk the `use_figma`
    // transport's size/time budget in one whole-file walk (the exact
    // failure this scoping also incidentally fixes, by shrinking the walked
    // surface rather than chunking it). `loadAllPagesAsync` resolves every
    // `sweepNodeIds` entry regardless of which page it lives on without
    // ever switching `figma.currentPage` — so this can audit the whole
    // scoped surface in ONE `use_figma` call.
    try {
      await figma.loadAllPagesAsync()
    } catch {
      /* sandbox: figma.root.findAll / cross-page getNodeByIdAsync sees only loaded pages */
    }
    const sweepOpts = { hard: false, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames, compositeNames, compositeNamingHard, runRecipeTier0Checks, viewport, copyAllowedStrings }
    for (const nodeId of sweepNodeIds) {
      const match = await figma.getNodeByIdAsync(nodeId)
      if (!match) {
        violations.push({ severity: 'advisory', rule: 'audit-target-not-found', nodeId, nodeName: null, detail: `no node resolves to nodeId "${nodeId}" — the registry entry may be stale` })
        continue
      }
      const owningPageName = findOwningPage(match)?.name ?? ''
      if (isWireframePageName(owningPageName)) continue
      await walk(match, { ...sweepOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
    }
    for (const page of figma.root.children) {
      if (!isDesignPageName(page.name) && !sweepPageNames.includes(page.name)) continue
      if (isWireframePageName(page.name)) continue
      for (const topLevel of page.children) {
        await walk(topLevel, { ...sweepOpts, isScreenFrame: isScreenTopLevel(topLevel) }, violations)
      }
    }
  }

  return violations
}

