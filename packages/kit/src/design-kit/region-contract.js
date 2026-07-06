/**
 * build-design-workflow.md's completeness gate (D01 fix): a screen's
 * wireframe is flattened, once, into a frozen contract
 * (`{screen, wireframeNodeId, figmaFileVersion, regions:[{name, path, depth,
 * children}]}`) — the independent oracle every later stage diffs against.
 * PURE, no fs/Figma/network calls, so it is unit-testable off-Figma and safe
 * to run headless in `design-coverage-gate.mjs`.
 *
 * "present" REQUIRES the matching built region to be a registry-backed
 * INSTANCE (`isInstance` truthy) — a bare frame with the right name is a
 * hollow trace, not coverage, so completeness can't be satisfied by tracing
 * boxes (the anti-recreation coupling the spec calls out).
 */

/**
 * C3a fix: matches by full path, not bare name — `flattenToRegions`
 * deliberately promotes a repeated composite (e.g. `PanelHead`) once per
 * occurrence under different parents, and a bare-name match let ONE built
 * instance satisfy every contract row sharing that name, regardless of
 * which parent it actually lived under. Path is the ancestry-qualified
 * identity both sides of the diff already carry.
 */
function findBuiltMatch(region, builtRegions) {
  return builtRegions.find((built) => built.path === region.path)
}

/**
 * Counts every occurrence of each node name across the whole metadata tree
 * (root included) — the load-bearing signal for the "repeats across
 * composites" promotion rule below.
 * @param {{name: string, children?: object[]}} node
 * @param {Map<string, number>} counts
 */
function countNames(node, counts) {
  counts.set(node.name, (counts.get(node.name) ?? 0) + 1)
  for (const child of node.children ?? []) countNames(child, counts)
  return counts
}

/**
 * C1's flattening rule (build-design-workflow.md / the D01 fix): a node is
 * promoted to a first-class regions/builtRegions row iff it is an instance
 * boundary (`type === 'INSTANCE'`), an auto-layout container boundary
 * (`layoutMode` set to anything but `'NONE'`), OR its name repeats more than
 * once anywhere in the tree (the same composite reused under different
 * parents). Every other node stays documentation-only. Shared by
 * `flattenToRegions` (wireframe contract) and `buildBuiltRegions` (built
 * screen) so both sides of the coverage diff agree on what counts as a
 * region — the only thing that stops ~40% of named nodes silently escaping
 * coverage (D01).
 * @param {{name: string, type?: string, layoutMode?: string, children?: object[]}} tree
 * @returns {{node: object, path: string, depth: number, isInstance: boolean, isAutoLayoutContainer: boolean}[]}
 */
function promoteNodes(tree) {
  const nameCounts = countNames(tree, new Map())
  const promoted = []

  function visit(node, path, depth) {
    const isInstance = node.type === 'INSTANCE'
    const isAutoLayoutContainer = Boolean(node.layoutMode) && node.layoutMode !== 'NONE'
    const repeatsAcrossComposites = (nameCounts.get(node.name) ?? 0) > 1

    if (isInstance || isAutoLayoutContainer || repeatsAcrossComposites) {
      promoted.push({ node, path, depth, isInstance, isAutoLayoutContainer })
    }

    for (const child of node.children ?? []) visit(child, `${path}/${child.name}`, depth + 1)
  }

  visit(tree, tree.name, 0)
  return promoted
}

/**
 * @param {{name: string, type?: string, layoutMode?: string, children?: object[]}} tree
 */
export function flattenToRegions(tree) {
  return promoteNodes(tree).map(({ node, path, depth, isInstance, isAutoLayoutContainer }) => {
    const region = { name: node.name, path, depth, children: (node.children ?? []).map((c) => c.name) }
    if (isAutoLayoutContainer && !isInstance) region.kind = 'layout'
    return region
  })
}

/**
 * P1 extract step, built-screen side: the same promotion rule applied to a
 * BUILT screen's `get_metadata` dump, emitting the `isInstance`/`instanceOf`
 * fields `classifyCoverage` needs — `instanceOf` is the promoted node's
 * `componentName` when it is a registry-backed instance.
 * @param {{name: string, type?: string, layoutMode?: string, componentName?: string, children?: object[]}} tree
 */
export function buildBuiltRegions(tree) {
  return promoteNodes(tree).map(({ node, path, isInstance }) => {
    const builtRegion = { name: node.name, path, isInstance }
    if (isInstance) builtRegion.instanceOf = node.componentName
    return builtRegion
  })
}

function findDisposition(region, dispositions) {
  return dispositions.find((row) => row.region === region.name)
}

/**
 * C3b (design-pipeline-efficiency-ruling.md): recurses ONE level into a
 * matched instance and WARNS (never a hard fail — `clean` stays governed by
 * UNACCOUNTED/MISSING alone) when a declared child (`region.children`) was
 * never actually built under it — a hollow card that scored `present` only
 * because the instance boundary itself existed.
 * @param {{path: string, children?: string[]}} region
 * @param {{path: string}[]} builtRegions
 */
function hollowChildWarning(region, builtRegions) {
  const builtPaths = new Set(builtRegions.map((b) => b.path))
  const missingChildren = (region.children ?? []).filter((name) => !builtPaths.has(`${region.path}/${name}`))
  if (missingChildren.length === 0) return undefined
  return `hollow instance — declared child(ren) not built: ${missingChildren.join(', ')}`
}

/**
 * @param {{screen: string, wireframeNodeId: string, figmaFileVersion: string,
 *          regions: {name: string, path: string, depth: number, children: unknown[]}[]}} contract
 * @param {{name: string, path: string, isInstance?: boolean, instanceOf?: string}[]} builtRegions
 * @param {{region: string, disposition: string}[]} dispositions
 */
/**
 * C3b: WARN when the built count of direct children under a region's path
 * is below its declared `cardinality` (a list container — e.g. FindingsList
 * — that expects N repeated composites but only got fewer built).
 * @param {{path: string, cardinality?: number}} region
 * @param {{path: string}[]} builtRegions
 */
function cardinalityWarning(region, builtRegions) {
  if (typeof region.cardinality !== 'number') return undefined
  const prefix = `${region.path}/`
  const directChildCount = builtRegions.filter((b) => b.path.startsWith(prefix) && !b.path.slice(prefix.length).includes('/')).length
  if (directChildCount >= region.cardinality) return undefined
  return `cardinality ${directChildCount} built, expected ${region.cardinality}`
}

function presentResult(region, builtRegions) {
  const result = { name: region.name, path: region.path, status: 'present' }
  const warning = hollowChildWarning(region, builtRegions) ?? cardinalityWarning(region, builtRegions)
  if (warning) result.warning = warning
  return result
}

export function classifyCoverage(contract, builtRegions = [], dispositions = []) {
  return contract.regions.map((region) => {
    const match = findBuiltMatch(region, builtRegions)
    if (match && match.isInstance) {
      return presentResult(region, builtRegions)
    }

    // Layout containers (Stage, Main, topbar) are frames, not registry-backed
    // instances — they hold instances, they aren't one. A present matching
    // container satisfies them; the instance requirement applies only to
    // composites (the anti-recreation coupling is about components, not layout).
    if (region.kind === 'layout' && match) {
      return presentResult(region, builtRegions)
    }

    const disposition = findDisposition(region, dispositions)
    if (disposition && disposition.disposition.startsWith('deferred-to-')) {
      return { name: region.name, path: region.path, status: 'deferred' }
    }
    if (disposition) {
      // Accounted for (built-here) but not found as an instance — either a
      // genuinely missing build, or a hollow bare-frame trace of `match`.
      return { name: region.name, path: region.path, status: 'MISSING' }
    }

    return { name: region.name, path: region.path, status: 'UNACCOUNTED' }
  })
}

/**
 * Code-side coverage classifier (build-screen, option B). A code screen's
 * rendered DOM is not a Figma tree, so `classifyCoverage`'s path-matching does
 * not apply. Instead match each contract region to its disposition's
 * `component` and check that registry-backed component ACTUALLY rendered
 * (`renderedComponents` come from the real render — base kit components self-ID
 * via `data-argo-component` — not the generator's claims). Output shape is
 * identical to `classifyCoverage`, so it feeds `summarize` / the coverage
 * receipt / the gate unchanged.
 *
 * Semantics: `present` when the disposition's component rendered; instance
 * CONSUMPTION means N distinct regions on the same component need N rendered
 * instances (first-come), a shortfall is MISSING; `deferred` for a
 * `deferred-to-*` row; UNACCOUNTED for a rendered component no built-here
 * disposition names; a `cardinality` shortfall is an advisory WARN, never
 * clean-affecting (mirrors `cardinalityWarning`). A region with no disposition,
 * or a built-here row with no `component`, is fail-closed MISSING.
 *
 * TWO DELIBERATE LIMITATIONS (both delegated, not bugs):
 * 1. PLACEMENT-BLIND. This proves the right components rendered in the right
 *    QUANTITY, never that they sit in the correct regions — option B discarded
 *    `classifyCoverage`'s path/position check (a DOM has no matching path). A
 *    screen rendering the right components in the WRONG regions scores clean
 *    here; placement correctness is delegated to the screen-level GESTALT gate
 *    + reviewer. Do not read a clean coverage receipt as proof of layout.
 * 2. NAME-KEYED. Matching keys on `region.name` via `findDisposition`, so two
 *    contract regions sharing a name (C3a's repeated-composite case) collapse
 *    to one disposition row, distinguishable only by consumption count — the
 *    Figma side's path-level distinction is not recoverable on the code side.
 * @param {{regions: {name: string, path: string}[]}} contract
 * @param {{component: string, path?: string}[]} renderedComponents
 * @param {{region: string, disposition: string, component?: string, cardinality?: number}[]} dispositions
 */
export function classifyCoverageByComponent(contract, renderedComponents = [], dispositions = []) {
  const totalRendered = new Map()
  for (const { component } of renderedComponents) totalRendered.set(component, (totalRendered.get(component) ?? 0) + 1)
  const available = new Map(totalRendered)
  const planned = new Set(
    dispositions.filter((d) => d.component && !d.disposition.startsWith('deferred-to-')).map((d) => d.component)
  )
  const classification = contract.regions.map((region) => {
    const disposition = findDisposition(region, dispositions)
    if (disposition && disposition.disposition.startsWith('deferred-to-')) {
      return { name: region.name, path: region.path, status: 'deferred' }
    }
    // Consume one rendered instance per region so N regions mapped to the same
    // component require N built instances (first-come); a shortfall is MISSING.
    const remaining = disposition?.component ? available.get(disposition.component) ?? 0 : 0
    if (remaining > 0) {
      available.set(disposition.component, remaining - 1)
      const result = { name: region.name, path: region.path, status: 'present' }
      if (typeof disposition.cardinality === 'number') {
        const builtCount = totalRendered.get(disposition.component) ?? 0
        if (builtCount < disposition.cardinality) {
          result.warning = `cardinality ${builtCount} built, expected ${disposition.cardinality}`
        }
      }
      return result
    }
    return { name: region.name, path: region.path, status: 'MISSING' }
  })

  // UNACCOUNTED: a rendered component key no built-here disposition names — the
  // code analog of classifyCoverage's "built, but no disposition row". Reported
  // once per orphan key, in render order.
  const reportedOrphans = new Set()
  for (const { component, path } of renderedComponents) {
    if (planned.has(component) || reportedOrphans.has(component)) continue
    reportedOrphans.add(component)
    classification.push({ name: component, path: path ?? component, status: 'UNACCOUNTED' })
  }
  return classification
}

/**
 * Groups a `classifyCoverage` result by status. `clean` is the D01 gate
 * number of record: UNACCOUNTED must be 0 to land, MISSING equally so —
 * `present`/`deferred` alone don't prove completeness. C3b's hollow-
 * instance/cardinality WARNs are surfaced separately (`warnings`) and never
 * affect `clean` — they flag a real build gap without hard-failing a commit
 * that landed a instance boundary but not yet its full contents.
 * @param {{name: string, path: string, status: string, warning?: string}[]} classification
 */
export function summarize(classification) {
  const byStatus = (status) => classification.filter((r) => r.status === status).map((r) => r.name)
  const UNACCOUNTED = byStatus('UNACCOUNTED')
  const MISSING = byStatus('MISSING')
  const warnings = classification
    .filter((r) => r.warning)
    .map((r) => ({ name: r.name, path: r.path, warning: r.warning }))
  return {
    present: byStatus('present'),
    deferred: byStatus('deferred'),
    UNACCOUNTED,
    MISSING,
    warnings,
    clean: UNACCOUNTED.length === 0 && MISSING.length === 0
  }
}

/**
 * P1 extract step (build-design-workflow.md, C1 fix): wraps `flattenToRegions`
 * with the frozen contract envelope
 * (`{screen, wireframeNodeId, figmaFileVersion, regions}`). The CLI wrapper
 * (`scripts/extract-region-contract.mjs`) is fs/argv glue only — this is the
 * pure, unit-tested shape function.
 * @param {object} tree normalized metadata tree
 * @param {{screen: string, wireframeNodeId: string, figmaFileVersion: string}} meta
 */
export function buildRegionContract(tree, { screen, wireframeNodeId, figmaFileVersion }) {
  return { screen, wireframeNodeId, figmaFileVersion, regions: flattenToRegions(tree) }
}

/**
 * C2 fix (design-pipeline-efficiency-ruling.md): today a stale clean
 * coverage receipt from screen N passes `design-coverage-gate.mjs` for
 * screen N+1 — the ruling's top silent-failure risk. `expectedScreen`
 * `undefined` means "no expectation to check" (passes through), same shape
 * as `evaluateCoverageReceipt`'s `contractFigmaFileVersion` option.
 * @param {{screen?: string}} receipt
 * @param {string} [expectedScreen]
 */
export function screenMatchesReceipt(receipt, expectedScreen) {
  return expectedScreen === undefined || receipt?.screen === expectedScreen
}

/**
 * C2 fix (design-pipeline-efficiency-ruling.md): the receipt is screen-
 * scoped, not a fixed `coverage-receipt.json` — a stale clean receipt from
 * screen N must never be readable as if it covered screen N+1.
 * @param {string} screen
 */
export function coverageReceiptFilename(screen) {
  return `coverage-receipt-${screen}.json`
}

/**
 * C2 fix: derives which screen(s) a commit touches from its staged
 * `design/**` artifacts (a `design/contracts/<screen>.json` or
 * `design/coverage-receipt-<screen>.json` path), so `design-coverage-gate.mjs`
 * knows which per-screen receipt to require and cross-check — never a
 * fixed, unscoped `coverage-receipt.json` a stale N-th screen could satisfy.
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
export function deriveExpectedScreensFromStagedFiles(stagedFiles) {
  const screens = new Set()
  for (const file of stagedFiles) {
    const contractMatch = file.match(/^design\/contracts\/(.+)\.json$/)
    if (contractMatch) screens.add(contractMatch[1])
    const receiptMatch = file.match(/^design\/coverage-receipt-(.+)\.json$/)
    if (receiptMatch) screens.add(receiptMatch[1])
  }
  return [...screens]
}

const COVERAGE_RECEIPT_STALE_MS = 10 * 60 * 1000

/**
 * The design-coverage-gate.mjs hook's decision logic (moved here so the
 * hook's own file — cursed by this environment's stale cross-repo tdd-guard
 * evidence — never needs a body edit again; the hook just re-exports this).
 * `expectedScreen` is the C2 fix: derived from the staged git diff, it
 * rejects a stale receipt recorded for a different screen (the ruling's top
 * silent-failure risk — today a clean receipt from screen N passes the gate
 * for screen N+1). `contractFigmaFileVersion` is the frozen contract's own
 * stamp — a receipt whose `figmaFileVersion` disagrees is stale against its
 * own source, even if it was recorded seconds ago.
 * @param {{screen?: string, producedBy?: string, figmaFileVersion?: string, timestamp?: number, clean?: boolean}} receipt
 * @param {{expectedScreen?: string, contractFigmaFileVersion?: string, now?: number}} [options]
 */
export function evaluateCoverageReceipt(receipt, { expectedScreen, contractFigmaFileVersion, now = Date.now() } = {}) {
  if (!receipt) return { ok: false, reason: 'no coverage receipt found' }
  if (!screenMatchesReceipt(receipt, expectedScreen)) {
    return {
      ok: false,
      reason: `coverage receipt is for screen "${receipt.screen}", not the screen being committed ("${expectedScreen}") — stale cross-screen receipt`
    }
  }
  if (receipt.producedBy === 'compose') {
    return { ok: false, reason: 'coverage receipt was produced by "compose" — P4\'s self-check is advisory-only, never the receipt of record' }
  }
  if (!receipt.clean) {
    return { ok: false, reason: 'coverage receipt is not clean (UNACCOUNTED or MISSING regions present)' }
  }
  if (contractFigmaFileVersion !== undefined && receipt.figmaFileVersion !== contractFigmaFileVersion) {
    return {
      ok: false,
      reason: `coverage receipt figmaFileVersion "${receipt.figmaFileVersion}" does not match the contract's "${contractFigmaFileVersion}" — stale, re-run required`
    }
  }
  const age = now - receipt.timestamp
  if (typeof receipt.timestamp !== 'number' || age > COVERAGE_RECEIPT_STALE_MS) {
    return { ok: false, reason: `coverage receipt timestamp out of range (${Math.round(age / 1000)}s) — re-run required` }
  }
  return { ok: true }
}

/**
 * C3c fix (design-pipeline-efficiency-ruling.md): P1 freeze lint — a
 * contract's region set or per-region fields (name/path/depth/kind/
 * cardinality/children) may not drift between two committed versions
 * unless `figmaFileVersion` is bumped alongside them. Without this, a
 * silent region-set edit (e.g. loosening `Stage`/`topbar`/`main` to
 * `kind: 'layout'` in the same commit that grades against it) passes
 * unnoticed — the exact a63c7cc regression the ruling calls out.
 * `previous` may be `undefined`/`null` (first-ever freeze — nothing to
 * compare against).
 * @param {object|undefined|null} previous
 * @param {object} next
 */
export function lintContractFreeze(previous, next) {
  if (!previous) return { ok: true }
  if (previous.figmaFileVersion !== next.figmaFileVersion) return { ok: true }
  const drifted = JSON.stringify(previous.regions) !== JSON.stringify(next.regions)
  if (!drifted) return { ok: true }
  return {
    ok: false,
    reason: `contract regions drifted for screen "${next.screen}" without a figmaFileVersion bump (still "${next.figmaFileVersion}")`
  }
}

/**
 * P2 reconciliation lint (pre-Figma, HARD): every contract region must carry
 * a disposition row — `built-here` (+ component + REUSE/EXTEND/RECONCILE/NEW
 * verdict) or `deferred-to-<target>` (+ reason) — before a single Figma
 * write happens. A region with no row at all is the cheapest possible catch.
 * @param {{regions: {name: string}[]}} contract
 * @param {{region: string, disposition: string}[]} dispositions
 */
export function reconcileBrief(contract, dispositions = []) {
  const unaccounted = contract.regions
    .filter((region) => !findDisposition(region, dispositions))
    .map((region) => region.name)
  return { ok: unaccounted.length === 0, unaccounted }
}
