#!/usr/bin/env node
/**
 * P5 compose-time coverage receipt (build-design-workflow.md): an
 * independent run does `get_metadata` on the BUILT screen, classifies it
 * against the frozen contract, and stamps
 * `design/coverage-receipt-<screen>.json` (C2 fix: screen-scoped, so a stale
 * clean receipt from screen N can never be read as if it covered screen
 * N+1) — the only thing the kit's design-coverage-gate trusts (never
 * Figma, so headless runs work). `buildCoverageReceipt` is the pure shape
 * function; the CLI entry point below is fs glue only, same split as
 * record-spec-diff-receipt.js.
 *
 * `producedBy` MUST be the identity of the run that produced the receipt
 * (e.g. `'design-verifier'`) — the gate hard-rejects `producedBy ===
 * 'compose'` (P4's self-check is advisory-only by spec, never the receipt
 * of record for the P5 commit gate).
 */
import { classifyCoverage, summarize } from '../design-kit/region-contract.js'

export function buildCoverageReceipt({
  contract,
  builtRegions,
  dispositions,
  producedBy,
  now = Date.now()
}: {
  contract: { screen: string; figmaFileVersion: string; regions: any[] }
  builtRegions: any[]
  dispositions: any[]
  producedBy: string
  now?: number
}) {
  const summary = summarize(classifyCoverage(contract as any, builtRegions, dispositions))
  return {
    screen: contract.screen,
    producedBy,
    figmaFileVersion: contract.figmaFileVersion,
    timestamp: now,
    summary,
    clean: summary.clean
  }
}

export { coverageReceiptFilename } from '../design-kit/region-contract.js'

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs')
  const { writeDesignJson } = await import('./lib/write-design-json.js')
  const { coverageReceiptFilename } = await import('../design-kit/region-contract.js')

  const [contractPath, builtRegionsPath, dispositionsPath, producedBy] = process.argv.slice(2)
  if (!contractPath || !builtRegionsPath || !producedBy) {
    console.error(
      'record-coverage-receipt: usage: argo design record-coverage-receipt <contract.json> <built-regions.json> <dispositions.json> <producedBy>'
    )
    process.exit(1)
  }

  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  const builtRegions = JSON.parse(readFileSync(builtRegionsPath, 'utf8'))
  const dispositions = dispositionsPath ? JSON.parse(readFileSync(dispositionsPath, 'utf8')) : []

  const receipt = buildCoverageReceipt({ contract, builtRegions, dispositions, producedBy })
  writeDesignJson(process.cwd(), coverageReceiptFilename(receipt.screen), receipt)
  console.log(JSON.stringify(receipt))
  process.exit(receipt.clean ? 0 : 1)
}
