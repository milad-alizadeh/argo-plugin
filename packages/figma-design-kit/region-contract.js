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
