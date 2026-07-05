#!/usr/bin/env node
/**
 * Writes `design/audit-receipt.json` — the deterministic proof
 * design-guard-stop.mjs checks before it lets a session end. Derived, never
 * hand-authored: this is the ONE place that turns a `use_figma`-returned
 * tier0-audit result (the `runTier0Audit` completion value, an array of
 * `{ severity, rule, nodeId, nodeName, detail }`) into the receipt shape.
 *
 * A sibling of assemble-tier0-audit.mjs (figma-audit/SKILL.md's procedure
 * documents this as its final step, run right after `use_figma` returns the
 * audit's violations array): `node scripts/record-audit-receipt.mjs --record
 * '<json>'`, where `<json>` is `{ componentNames, violations }`.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `writeCounterAtAudit` is read from `.argo/design-guard.json`'s current
 * `writeCount` (0 if no Figma writes have ever been recorded) so
 * design-guard-stop.mjs can detect a write that happened after this audit
 * ran, and demand a re-audit.
 */
export function recordAuditReceipt({ componentNames = [], violations = [] } = {}, { cwd, now = Date.now() } = {}) {
  if (!cwd) throw new Error('recordAuditReceipt: cwd is required')

  let writeCounterAtAudit = 0
  const guardStatePath = join(cwd, '.argo', 'design-guard.json')
  if (existsSync(guardStatePath)) {
    try {
      const state = JSON.parse(readFileSync(guardStatePath, 'utf8'))
      writeCounterAtAudit = typeof state.writeCount === 'number' ? state.writeCount : 0
    } catch {
      writeCounterAtAudit = 0 // corrupt state — this writer never blocks; the stop gate does
    }
  }

  const receipt = {
    timestamp: now,
    componentNames,
    violationCount: violations.length,
    writeCounterAtAudit
  }

  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(join(cwd, 'design', 'audit-receipt.json'), JSON.stringify(receipt, null, 2))
  return receipt
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const recordIndex = args.indexOf('--record')
  if (recordIndex === -1) {
    console.error('record-audit-receipt: usage: node scripts/record-audit-receipt.mjs --record \'{"componentNames":[...],"violations":[...]}\'')
    process.exit(1)
  }
  const json = args[recordIndex + 1]
  if (!json) {
    console.error('record-audit-receipt: --record requires a JSON argument')
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    console.error('record-audit-receipt: --record argument is not valid JSON')
    process.exit(1)
  }
  const receipt = recordAuditReceipt(parsed, { cwd: process.cwd() })
  console.log(JSON.stringify(receipt))
}
