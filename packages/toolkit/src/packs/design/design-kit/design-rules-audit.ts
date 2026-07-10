/**
 * Canonical design-rules Figma hygiene audit — the one copy of this logic;
 * every caller shares it. A thin Plugin-API walker: marshals live `figma.*`
 * node/variable objects into plain-object shapes and delegates the actual
 * rule logic to this package's unit-tested pure functions. Every
 * project-specific value arrives through `options` at call time, never
 * through a splice/placeholder step baked into a committed copy.
 *
 * Reports violations as { severity: 'hard' | 'advisory', rule, nodeId, nodeName, detail }.
 * `hard` fails the calling skill loud; `advisory` surfaces on a file-wide
 * sweep but doesn't block. Cannot be unit-tested outside Figma's Plugin API
 * sandbox; the options-passing plumbing around it is tested separately.
 * `figma` is a runtime global here — declared `any` locally, matching the
 * pragmatic typing used throughout this package's node/variable shapes.
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
  isCoverPageName,
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
  untracedCopyViolation,
  missingComponentDescriptionViolation,
  unsectionedComponentViolation
} from './design-rules/index.js'

type Reporter = (rule: string, detail: string) => void

/**
 * Fetched early so the false-positive tag can see it before any violation is
 * reported. `overrides` exists only on INSTANCE nodes — reading it on any
 * other type throws in the sandbox.
 */
async function resolveInstanceContext(node: any) {
  const main = node.type === 'INSTANCE' ? await node.getMainComponentAsync() : null
  const overriddenFields =
    node.type === 'INSTANCE' ? (node.overrides ?? []).flatMap((o: any) => o.overriddenFields ?? []) : []
  return { main, overriddenFields }
}

/**
 * Rule functions that read `node.insideInstance` (the kit-internals
 * exemption) need it marshaled onto the node — it's an opts-only value the
 * real Plugin-API node never carries as a property. `nodeCtx` delegates to
 * the real node so every existing property/getter still works, and adds
 * `insideInstance` on top.
 * A get-only Proxy, not Object.create/assign — the sandbox node is itself a
 * Proxy whose set trap rejects unknown properties even via a derived
 * object. Rule functions only ever read nodeCtx.
 */
function buildNodeCtx(
  node: any,
  { insideInstance, ancestorSolidFill, isScreenFrame, insideCategoryShelf }: { insideInstance: boolean; ancestorSolidFill: any; isScreenFrame: boolean; insideCategoryShelf: boolean }
) {
  return new Proxy(node, {
    get: (target: any, prop: string) =>
      prop === 'insideInstance'
        ? insideInstance
        : prop === 'ancestorSolidFill'
          ? ancestorSolidFill
          : prop === 'isScreenFrame'
            ? isScreenFrame
            : prop === 'insideCategoryShelf'
              ? insideCategoryShelf
              : target[prop]
  })
}

function runBindingAndTextStyleChecks(nodeCtx: any, report: Reporter) {
  for (const v of unboundFillViolations(nodeCtx)) report(v.rule, v.detail)
  for (const v of unboundStrokeViolations(nodeCtx)) report(v.rule, v.detail)
  const radius = unboundRadiusViolation(nodeCtx)
  if (radius) report(radius.rule, radius.detail)
  const type = textStyleRequiredViolation(nodeCtx)
  if (type) report(type.rule, type.detail)
}

/** Universal per-node a11y/overflow checks: no tags, no config. */
function runA11yAndCopyChecks(nodeCtx: any, node: any, report: Reporter, violations: any[], copyAllowedStrings: string[] | null) {
  for (const v of hugOverflowViolations(nodeCtx)) report(v.rule, v.detail)
  const touchTarget = touchTargetViolation(nodeCtx)
  if (touchTarget) report(touchTarget.rule, touchTarget.detail)
  const contrast = textContrastViolation(nodeCtx)
  if (contrast) report(contrast.rule, contrast.detail)
  // Hard on named audits via report(); inert when no copy deck is in play
  // (copyAllowedStrings null). Called with nodeCtx so the rule can read
  // insideInstance if its exemption policy changes; today it deliberately
  // audits instance internals too.
  const untracedCopy = untracedCopyViolation(nodeCtx, { copyAllowedStrings })
  if (untracedCopy) report(untracedCopy.rule, untracedCopy.detail)
  // Advisory, never hard: `textTruncation: ENDING` is Figma's intentional
  // ellipsis setting, and the rule can't tell intentional truncation from an
  // accidental clip, so it flags for review but must not block. The
  // accidental-clip defect is a different mechanism, left to the blind
  // fidelity-verifier.
  const truncation = textTruncationViolation(nodeCtx)
  if (truncation)
    violations.push({ severity: 'advisory', rule: truncation.rule, nodeId: node.id, nodeName: node.name, detail: truncation.detail })
}

function runLayoutChecks(nodeCtx: any, node: any, report: Reporter, insideInstance: boolean, isScreenFrame: boolean, viewport: { width: number; height: number } | undefined) {
  const autoLayout = missingAutoLayoutViolation(nodeCtx)
  if (autoLayout) report(autoLayout.rule, autoLayout.detail)

  const viewportMismatch = screenViewportMismatchViolation(node, { isScreenFrame, viewport })
  if (viewportMismatch) report(viewportMismatch.rule, viewportMismatch.detail)

  const handDrawnIcon = handDrawnIconViolation({ type: node.type, insideInstance })
  if (handDrawnIcon) report(handDrawnIcon.rule, handDrawnIcon.detail)
}

async function runGapPaddingCheck(
  node: any,
  report: Reporter,
  { insideInstance, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames }: {
    insideInstance: boolean
    semanticCollectionName: string
    primitivesCollectionName: string
    additionalAllowedCollectionNames: string[]
  }
) {
  if (!('layoutMode' in node)) return
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

/**
 * `main`/`overriddenFields` are resolved once up front (`resolveInstanceContext`) so
 * the false-positive tag can see them before any violation is reported.
 */
function runInstanceChecks(node: any, main: any, overriddenFields: string[], insideInstance: boolean, report: Reporter) {
  if (node.type !== 'INSTANCE') return
  const detached = detachedInstanceViolation({ type: node.type, hasMainComponent: Boolean(main) })
  if (detached) report(detached.rule, detached.detail)

  const kitOverride = kitInstanceOverrideViolation({
    type: node.type,
    isRemoteInstance: Boolean(main?.remote),
    overriddenFields
  })
  if (kitOverride) report(kitOverride.rule, kitOverride.detail)

  // Any resolvable main, remote or local — gating on remote-only would miss
  // a duplicated-starter file, where all icon mains are local. Hard on
  // named audits. Top-level only: nested kit-icon instances re-flag the
  // same glyph at every nesting level with unreliable native-size readings.
  if (main && !insideInstance) {
    const strokeScaleShape = marshalIconStrokeScale(node, main)
    if (strokeScaleShape) {
      const strokeScale = strokeScaleViolation(strokeScaleShape)
      if (strokeScale) report(strokeScale.rule, strokeScale.detail)
    }
  }
}

function runNamingAndMetadataChecks(
  node: any,
  nodeCtx: any,
  report: Reporter,
  violations: any[],
  { hard, compositeNames, compositeNamingHard }: { hard: boolean; compositeNames: string[]; compositeNamingHard: boolean }
) {
  const nonSemanticName = nonSemanticNameViolation(nodeCtx)
  if (nonSemanticName) report(nonSemanticName.rule, nonSemanticName.detail)

  // Composite-naming check respects a hard flag so it can protect the
  // components-first guarantee. Stays advisory by default until the
  // wrapper-frame exemption is calibrated; only a named audit can escalate
  // it, a file-wide sweep is always advisory.
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

  // Always advisory regardless of `hard`: self-corrects on the next
  // design-component upsert, never a structural defect that should fail a
  // named audit.
  // nodeCtx, not node — the rule reads the walker-marshaled
  // insideCategoryShelf, and the sandbox node proxy throws on unknown
  // property reads.
  const unsectioned = unsectionedComponentViolation(nodeCtx)
  if (unsectioned) {
    violations.push({ severity: 'advisory', rule: unsectioned.rule, nodeId: node.id, nodeName: node.name, detail: unsectioned.detail })
  }

  // Advisory on the file-wide sweep, hard on a NAMED audit (same split as
  // untraced-copy): a component audited by name — component-create's annotate
  // stage, component-edit — must carry a description (purpose + usage).
  const missingDescription = missingComponentDescriptionViolation(node)
  if (missingDescription) report(missingDescription.rule, missingDescription.detail)

  const lineHeight = implicitLineHeightViolation(node)
  if (lineHeight) report(lineHeight.rule, lineHeight.detail)

  // Always advisory regardless of `hard` (same pattern as composite-naming):
  // a style-hygiene nit on authored copy, never a structural defect that
  // should fail a named audit.
  const emDash = emDashViolation(node)
  if (emDash) {
    violations.push({ severity: 'advisory', rule: emDash.rule, nodeId: node.id, nodeName: node.name, detail: emDash.detail })
  }

  // node, not nodeCtx — using node directly avoids implying the check
  // depends on insideInstance, which it doesn't. Always advisory regardless
  // of `hard`.
  for (const overflow of unclippedOverflowViolations(node)) {
    violations.push({ severity: 'advisory', rule: overflow.rule, nodeId: node.id, nodeName: node.name, detail: overflow.detail })
  }
}

/**
 * getPluginData/getPluginDataKeys are unavailable in the use_figma sandbox
 * (private-plugin-only API) — storyUrl lives in shared plugin data, with a
 * guarded private-data fallback for files stamped by older syncs.
 */
function runStoryUrlCheck(node: any, report: Reporter) {
  if (node.type !== 'COMPONENT') return
  let storyUrl = node.getSharedPluginData('argo', 'storyUrl')
  if (!storyUrl) {
    try {
      storyUrl = node.getPluginDataKeys().includes('storyUrl') ? node.getPluginData('storyUrl') : ''
    } catch {
      storyUrl = ''
    }
  }
  if (!storyUrl) return
  const storyScope = storyUrlScopeViolation({ type: node.type, storyUrl })
  if (storyScope) report(storyScope.rule, storyScope.detail)
}

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
    runRecipeDesignRulesChecks,
    viewport,
    isScreenFrame = false,
    ancestorSolidFill = null,
    copyAllowedStrings = null,
    insideCategoryShelf = false
  }: {
    hard: boolean
    semanticCollectionName?: string
    primitivesCollectionName?: string
    additionalAllowedCollectionNames?: string[]
    insideInstance?: boolean
    compositeNames?: string[]
    compositeNamingHard?: boolean
    runRecipeDesignRulesChecks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean; isScreenFrame?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    isScreenFrame?: boolean
    ancestorSolidFill?: any
    copyAllowedStrings?: string[] | null
    insideCategoryShelf?: boolean
  }
) {
  const violations: any[] = []

  const { main, overriddenFields } = await resolveInstanceContext(node)

  // A node resolving to a kit main component whose only overrides are
  // size/fill/stroke is presumptively a gate bug, not a real hygiene defect —
  // tag every violation reported for it so the reviewer never has to
  // self-grade that judgment. Never licenses detaching.
  const falsePositiveTag = possibleGateFalsePositiveTag({
    isRemoteInstance: Boolean(main?.remote),
    insideInstance,
    overriddenFields
  })
  const report: Reporter = (rule, detail) => {
    violations.push({
      severity: hard ? 'hard' : 'advisory',
      rule,
      nodeId: node.id,
      nodeName: node.name,
      detail,
      ...(falsePositiveTag ? { tag: 'possible-gate-false-positive — does NOT license detaching' } : {})
    })
  }

  const nodeCtx = buildNodeCtx(node, { insideInstance, ancestorSolidFill, isScreenFrame, insideCategoryShelf })

  runBindingAndTextStyleChecks(nodeCtx, report)
  runA11yAndCopyChecks(nodeCtx, node, report, violations, copyAllowedStrings)
  runLayoutChecks(nodeCtx, node, report, insideInstance, isScreenFrame, viewport)
  await runGapPaddingCheck(node, report, { insideInstance, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames })
  runInstanceChecks(node, main, overriddenFields, insideInstance, report)
  runNamingAndMetadataChecks(node, nodeCtx, report, violations, { hard, compositeNames, compositeNamingHard })
  runStoryUrlCheck(node, report)

  // Recipe-owned per-node checks (e.g. non-semantic-binding) — undefined for
  // a recipe with no checks.
  if (typeof runRecipeDesignRulesChecks === 'function') {
    violations.push(...(await runRecipeDesignRulesChecks(node, { hard, insideInstance, isScreenFrame })))
  }

  return violations
}

/**
 * Marshals the plain shape `strokeScaleViolation` checks over, for an
 * icon-like instance: a component whose main is a single-VECTOR component
 * (a frame wrapping exactly one VECTOR child, `layoutMode: 'NONE'`). Returns
 * null for any instance that doesn't match that shape (a non-icon component);
 * the caller only runs the rule when this returns a shape.
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
 * Marshals a single Auto Layout gap/padding field. boundVariables for a
 * number property is a single { id } object, not an array (unlike
 * fills/strokes) — resolved and marshaled explicitly, field by field, since
 * remote/key/variableCollectionId are prototype getters, not own properties,
 * so a live Variable must never be spread.
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
 * file, including on the Cover page — walk up its parent chain to find
 * the owning PAGE so the Cover-page exemption applies there too.
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
      ancestorSolidFill: ownSolid ?? opts.ancestorSolidFill ?? null,
      // A category shelf is a plain FRAME on Custom Components named after a
      // configured componentCategories entry; everything under it counts as
      // sectioned for unsectionedComponentViolation.
      insideCategoryShelf:
        opts.insideCategoryShelf ||
        (node.type === 'FRAME' && (opts.componentCategories ?? []).includes(node.name))
    }
    for (const child of node.children) await walk(child, childOpts, out)
  }
}

/**
 * `options`: `componentNodeIds`/`componentNames` get a hard audit (fails
 * loud) when set; omitted -> advisory file-wide sweep of un-synced frames.
 * `componentNodeIds` is the authoritative target list, resolved against
 * `design/registry.json` upstream, never matched by name here.
 * `componentNames` is only a fallback for a target with no registry entry,
 * resolved to a nodeId by an unambiguous single-match name lookup; an
 * ambiguous name reports `ambiguous-audit-target-name` instead of silently
 * sweeping every match.
 * `compositeNames` feeds `compositeRegionNamingViolation` (always advisory).
 * `runRecipeDesignRulesChecks` is the recipe's extension point; omit it for a
 * recipe with no checks.
 */
export async function runDesignRulesAudit(
  options: {
    componentNodeIds?: string[]
    componentNames?: string[]
    compositeNames?: string[]
    compositeNamingHard?: boolean
    semanticCollectionName?: string
    primitivesCollectionName?: string
    additionalAllowedCollectionNames?: string[]
    runRecipeDesignRulesChecks?: (node: any, ctx: { hard: boolean; insideInstance?: boolean; isScreenFrame?: boolean }) => Promise<any[]>
    viewport?: { width: number; height: number }
    pageId?: string
    sweepNodeIds?: string[]
    sweepPageNames?: string[]
    screenNodeIds?: string[]
    copyAllowedStrings?: string[] | null
    componentCategories?: string[]
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
    runRecipeDesignRulesChecks,
    viewport,
    pageId,
    sweepNodeIds = [],
    sweepPageNames = [],
    screenNodeIds = [],
    copyAllowedStrings = null,
    componentCategories = []
  } = options
  const violations: any[] = []
  // Screen identity is registry-driven: a top-level artboard is a screen
  // frame iff its nodeId is registered as one, regardless of page name.
  const screenNodeIdSet = new Set(screenNodeIds)
  // A top-level frame is a screen either by registry membership or by
  // carrying a live `@screen` Dev Mode annotation — frames have no
  // `description`, unlike code-owned components, so the annotation layer is
  // where the marker lives, and this makes a hand-annotated screen audit
  // correct before any registry sync.
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
    const walkOpts = { hard: true, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames, compositeNames, compositeNamingHard, runRecipeDesignRulesChecks, viewport, copyAllowedStrings, componentCategories }

    // Authoritative path: target by the registry's real nodeId, resolved by
    // the caller before this call ever runs — `getNodeByIdAsync` is
    // unambiguous, unlike a name-based sweep, which matches every
    // same-named node in the file.
    for (const nodeId of componentNodeIds) {
      const match = await figma.getNodeByIdAsync(nodeId)
      if (!match) {
        violations.push({ severity: 'hard', rule: 'audit-target-not-found', nodeId, nodeName: null, detail: `no node resolves to nodeId "${nodeId}" — the registry entry may be stale` })
        continue
      }
      const owningPageName = findOwningPage(match)?.name ?? ''
      if (isCoverPageName(owningPageName)) continue
      // isScreenFrame only when `match` is genuinely the page's top-level
      // frame (parent IS the page) — a registry nodeId can resolve to a node
      // NESTED under a design page, which must still be name/viewport-gated.
      await walk(match, { ...walkOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
    }

    // Name-resolution fallback (ONLY for a target with no registry nodeId —
    // e.g. a foundation frame/SCREEN never entered into the registry).
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
      if (isCoverPageName(owningPageName)) continue
      // isScreenFrame only when `match` is genuinely the page's top-level
      // frame (parent IS the page) — a registry nodeId can resolve to a node
      // NESTED under a design page, which must still be name/viewport-gated.
      await walk(match, { ...walkOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
    }
  } else if (pageId) {
    // Legacy single-page whole-page walk — explicit opt-in only, reachable
    // ONLY when a caller passes `pageId`. This is no longer reachable as a
    // silent fallback: the scoped-sweep branch below is now the sole default
    // whenever neither a named audit nor `pageId` is requested, so an
    // empty/misconfigured `sweepNodeIds`/`sweepPageNames` can never
    // accidentally degrade into a whole-file walk.
    const page = await figma.getNodeByIdAsync(pageId)
    if (page && !isCoverPageName(page.name)) {
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
            runRecipeDesignRulesChecks,
            viewport,
            copyAllowedStrings,
            isScreenFrame: isScreenTopLevel(topLevel)
          },
          violations
        )
      }
    }
  } else {
    // Scoped sweep — the sole DEFAULT file-wide sweep path now: every
    // registry-listed component (`sweepNodeIds`, kit or custom, no exemption)
    // plus every composed-screen page. A page is in scope when it matches the
    // project's real `D<NN> <group>` screen convention (`isDesignPageName`)
    // OR is explicitly named in `sweepPageNames` (additive — e.g. a project
    // with a literal "Screens" catch-all page, or any other non-`D<NN>`
    // convention it wants included). Matching by `isDesignPageName`
    // unconditionally (not gating the whole branch on `sweepPageNames` being
    // non-empty) avoids a default `sweepPageNames: ['Screens']` silently
    // matching zero pages on a project whose convention is one page per
    // screen (`D01 Onboarding`, `D02 Home`, ...). Kit primitive pages,
    // demo/example pages, and icon libraries stay out of scope: almost
    // entirely stock content nobody in the project touched, and on a 50+ page
    // file, large enough to risk the `use_figma` transport's size/time budget
    // in one whole-file walk. `loadAllPagesAsync` resolves every
    // `sweepNodeIds` entry regardless of which page it lives on without ever
    // switching `figma.currentPage` — so this can audit the whole scoped
    // surface in ONE `use_figma` call.
    try {
      await figma.loadAllPagesAsync()
    } catch {
      /* sandbox: figma.root.findAll / cross-page getNodeByIdAsync sees only loaded pages */
    }
    const sweepOpts = { hard: false, semanticCollectionName, primitivesCollectionName, additionalAllowedCollectionNames, compositeNames, compositeNamingHard, runRecipeDesignRulesChecks, viewport, copyAllowedStrings, componentCategories }
    for (const nodeId of sweepNodeIds) {
      const match = await figma.getNodeByIdAsync(nodeId)
      if (!match) {
        violations.push({ severity: 'advisory', rule: 'audit-target-not-found', nodeId, nodeName: null, detail: `no node resolves to nodeId "${nodeId}" — the registry entry may be stale` })
        continue
      }
      const owningPageName = findOwningPage(match)?.name ?? ''
      if (isCoverPageName(owningPageName)) continue
      await walk(match, { ...sweepOpts, isScreenFrame: isScreenTopLevel(match) }, violations)
    }
    for (const page of figma.root.children) {
      if (!isDesignPageName(page.name) && !sweepPageNames.includes(page.name)) continue
      if (isCoverPageName(page.name)) continue
      for (const topLevel of page.children) {
        await walk(topLevel, { ...sweepOpts, isScreenFrame: isScreenTopLevel(topLevel) }, violations)
      }
    }
  }

  return violations
}
