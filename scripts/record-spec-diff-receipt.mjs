#!/usr/bin/env node
/**
 * Computes the deterministic `design/spec-diff-receipt.json` shape —
 * `hooks/design-commit-gate.mjs` requires a fresh, passing one before a
 * commit touching generated component code (design/config.json's
 * `componentsPath`) can land. This pure function only shapes the receipt;
 * the CLI entry point below (unstested by convention, same as
 * assemble-tier0-audit.mjs's `bundleTier0Audit` CLI usage) is what actually
 * runs the spec-diff walker and persists the receipt via `writeDesignJson`.
 */
export function recordSpecDiffReceipt(exitCode, { now = Date.now() } = {}) {
  return { recordedAt: now, exitCode }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import('node:child_process')
  const { writeDesignJson } = await import('./write-design-json.mjs')

  const args = process.argv.slice(2)
  const sepIndex = args.indexOf('--')
  const command = sepIndex !== -1 ? args.slice(sepIndex + 1) : []
  if (command.length === 0) {
    console.error('record-spec-diff-receipt: usage: node scripts/record-spec-diff-receipt.mjs -- <test command...>')
    process.exit(1)
  }
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', cwd: process.cwd() })
  const exitCode = result.status ?? 1
  const receipt = recordSpecDiffReceipt(exitCode)
  writeDesignJson(process.cwd(), 'spec-diff-receipt.json', receipt)
  console.log(JSON.stringify(receipt))
  process.exit(exitCode)
}
