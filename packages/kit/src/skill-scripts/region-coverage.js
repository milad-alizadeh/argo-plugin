#!/usr/bin/env node
/**
 * P2 reconciliation lint (build-design-workflow.md, HARD, pre-Figma): the
 * brief's machine-readable region-disposition block must account for 100%
 * of a screen's frozen contract regions before a single Figma write happens
 * — the cheapest catch, item 1-3 in the spec's ordered list alone stop D01
 * here. Pure logic (`lintRegionCoverage`) is a thin wrapper over
 * `reconcileBrief` in the kit module; this file's CLI entry point is just
 * fs + arg glue (unit-tested by convention only through the pure function,
 * same as record-spec-diff-receipt.js's CLI usage).
 *
 * ASSUMPTION (spec doesn't pin the disposition block's on-disk shape): the
 * brief's region-disposition rows live as committed JSON alongside the
 * contract — `design/dispositions/<screen>.json`, an array of
 * `{region, disposition, component?, verdict?, target?, reason?}` rows —
 * rather than embedded in the brief's markdown prose. This keeps the lint
 * a pure JSON-in/JSON-out diff, consistent with every other design/*.json
 * receipt in this pack; editing screen-brief.md to author that block is a
 * separate, not-yet-built concern.
 */
import { reconcileBrief } from '../design-kit/region-contract.js'

/**
 * @param {{regions: {name: string}[]}} contract
 * @param {{region: string, disposition: string}[]} dispositions
 */
export function lintRegionCoverage(contract, dispositions) {
  return reconcileBrief(contract, dispositions)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs')

  const [contractPath, dispositionsPath] = process.argv.slice(2)
  if (!contractPath || !dispositionsPath) {
    console.error('region-coverage: usage: argo design region-coverage <contract.json> <dispositions.json>')
    process.exit(1)
  }

  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  const dispositions = JSON.parse(readFileSync(dispositionsPath, 'utf8'))
  const result = lintRegionCoverage(contract, dispositions)

  if (!result.ok) {
    console.error(`region-coverage: BLOCKED — ${result.unaccounted.length} contract region(s) have no disposition row:`)
    for (const name of result.unaccounted) console.error(`  - ${name}`)
    process.exit(1)
  }

  console.log(`region-coverage: ok — all ${contract.regions.length} contract region(s) accounted for`)
  process.exit(0)
}
