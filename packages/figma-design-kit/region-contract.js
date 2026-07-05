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

function findBuiltMatch(region, builtRegions) {
  return builtRegions.find((built) => built.name === region.name)
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
 * C1's flattening rule (build-design-workflow.md / the D01 fix): a node
 * becomes a first-class `regions` row iff it is an instance boundary
 * (`type === 'INSTANCE'`), an auto-layout container boundary (`layoutMode`
 * set to anything but `'NONE'`), OR its name repeats more than once anywhere
 * in the tree (the same composite reused under different parents). Every
 * other node stays documentation-only — its name lands in its parent's
 * `children` array and nothing else. This is the only thing that stops
 * ~40% of named nodes silently escaping coverage (D01).
 * @param {{name: string, type?: string, layoutMode?: string, children?: object[]}} tree
 */
export function flattenToRegions(tree) {
  const nameCounts = countNames(tree, new Map())
  const regions = []

  function visit(node, path, depth) {
    const isInstance = node.type === 'INSTANCE'
    const isAutoLayoutContainer = Boolean(node.layoutMode) && node.layoutMode !== 'NONE'
    const repeatsAcrossComposites = (nameCounts.get(node.name) ?? 0) > 1
    const promoted = isInstance || isAutoLayoutContainer || repeatsAcrossComposites

    if (promoted) {
      const region = { name: node.name, path, depth, children: (node.children ?? []).map((c) => c.name) }
      if (isAutoLayoutContainer && !isInstance) region.kind = 'layout'
      regions.push(region)
    }

    for (const child of node.children ?? []) visit(child, `${path}/${child.name}`, depth + 1)
  }

  visit(tree, tree.name, 0)
  return regions
}

function findDisposition(region, dispositions) {
  return dispositions.find((row) => row.region === region.name)
}

/**
 * @param {{screen: string, wireframeNodeId: string, figmaFileVersion: string,
 *          regions: {name: string, path: string, depth: number, children: unknown[]}[]}} contract
 * @param {{name: string, path: string, isInstance?: boolean, instanceOf?: string}[]} builtRegions
 * @param {{region: string, disposition: string}[]} dispositions
 */
export function classifyCoverage(contract, builtRegions = [], dispositions = []) {
  return contract.regions.map((region) => {
    const match = findBuiltMatch(region, builtRegions)
    if (match && match.isInstance) {
      return { name: region.name, path: region.path, status: 'present' }
    }

    // Layout containers (Stage, Main, topbar) are frames, not registry-backed
    // instances — they hold instances, they aren't one. A present matching
    // container satisfies them; the instance requirement applies only to
    // composites (the anti-recreation coupling is about components, not layout).
    if (region.kind === 'layout' && match) {
      return { name: region.name, path: region.path, status: 'present' }
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
 * Groups a `classifyCoverage` result by status. `clean` is the D01 gate
 * number of record: UNACCOUNTED must be 0 to land, MISSING equally so —
 * `present`/`deferred` alone don't prove completeness.
 * @param {{name: string, path: string, status: string}[]} classification
 */
export function summarize(classification) {
  const byStatus = (status) => classification.filter((r) => r.status === status).map((r) => r.name)
  const UNACCOUNTED = byStatus('UNACCOUNTED')
  const MISSING = byStatus('MISSING')
  return {
    present: byStatus('present'),
    deferred: byStatus('deferred'),
    UNACCOUNTED,
    MISSING,
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
