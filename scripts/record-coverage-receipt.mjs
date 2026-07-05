#!/usr/bin/env node
/**
 * P5 compose-time coverage receipt (build-design-workflow.md): an
 * independent run does `get_metadata` on the BUILT screen, classifies it
 * against the frozen contract, and stamps `design/coverage-receipt.json` —
 * the only thing `hooks/design-coverage-gate.mjs` trusts (never Figma, so
 * headless runs work). `buildCoverageReceipt` is the pure shape function;
 * the CLI entry point below is fs glue only, same split as
 * record-spec-diff-receipt.mjs.
 *
 * `producedBy` MUST be the identity of the run that produced the receipt
 * (e.g. `'design-verifier'`) — the gate hard-rejects `producedBy ===
 * 'compose'` (P4's self-check is advisory-only by spec, never the receipt
 * of record for the P5 commit gate).
 */
import { classifyCoverage, summarize } from '../packages/figma-design-kit/region-contract.js'

/**
 * @param {{contract: object, builtRegions: object[], dispositions: object[],
 *          producedBy: string, now?: number}} args
 */
export function buildCoverageReceipt({ contract, builtRegions, dispositions, producedBy, now = Date.now() }) {
  const summary = summarize(classifyCoverage(contract, builtRegions, dispositions))
  return {
    screen: contract.screen,
    producedBy,
    figmaFileVersion: contract.figmaFileVersion,
    timestamp: now,
    summary,
    clean: summary.clean
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs')
  const { writeDesignJson } = await import('./write-design-json.mjs')

  const [contractPath, builtRegionsPath, dispositionsPath, producedBy] = process.argv.slice(2)
  if (!contractPath || !builtRegionsPath || !producedBy) {
    console.error(
      'record-coverage-receipt: usage: node scripts/record-coverage-receipt.mjs <contract.json> <built-regions.json> <dispositions.json> <producedBy>'
    )
    process.exit(1)
  }

  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  const builtRegions = JSON.parse(readFileSync(builtRegionsPath, 'utf8'))
  const dispositions = dispositionsPath ? JSON.parse(readFileSync(dispositionsPath, 'utf8')) : []

  const receipt = buildCoverageReceipt({ contract, builtRegions, dispositions, producedBy })
  writeDesignJson(process.cwd(), 'coverage-receipt.json', receipt)
  console.log(JSON.stringify(receipt))
  process.exit(receipt.clean ? 0 : 1)
}
