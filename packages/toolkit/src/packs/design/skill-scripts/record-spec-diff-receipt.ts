#!/usr/bin/env node
/**
 * Computes the deterministic `design/spec-diff-receipt.json` shape —
 * the kit's design-commit-gate requires a fresh, passing one before a
 * commit touching generated component code (the `componentsPath` in the
 * app's `design.<app>` block in `.argo/config.json`) can land. This pure function only shapes the receipt;
 * the CLI entry point below (untested by convention, same as
 * bundle-design-rules-audit.js's `bundleDesignRulesAudit` CLI usage) is what actually
 * runs the spec-diff walker and persists the receipt via `writeDesignJson`.
 */
export function recordSpecDiffReceipt(exitCode: number, { now = Date.now() }: { now?: number } = {}) {
  return { recordedAt: now, exitCode }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import('node:child_process')
  const { writeDesignJson } = await import('./lib/write-design-json.js')

  const args = process.argv.slice(2)
  const sepIndex = args.indexOf('--')
  const command = sepIndex !== -1 ? args.slice(sepIndex + 1) : []
  if (command.length === 0) {
    console.error('record-spec-diff-receipt: usage: argo design record-spec-diff-receipt -- <test command...>')
    process.exit(1)
  }
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', cwd: process.cwd() })
  const exitCode = result.status ?? 1
  const receipt = recordSpecDiffReceipt(exitCode)
  writeDesignJson(process.cwd(), 'spec-diff-receipt.json', receipt)
  console.log(JSON.stringify(receipt))
  process.exit(exitCode)
}
