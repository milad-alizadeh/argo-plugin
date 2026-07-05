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

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeDesignJson } from './write-design-json.mjs'
import { findKitNameCollisions } from '../packages/figma-design-kit/kit-inventory.js'

/**
 * kit-awareness (kit-awareness.md §"Enforcement"): reads the three optional,
 * project-committed files a collision check needs and folds any unwaived
 * match into the receipt's violationCount — riding the existing
 * design-guard-stop.mjs rail rather than a new hook (the Figma sandbox can't
 * read a committed file or call `search_design_system`). Every input is
 * optional and fails open (absent/unreadable/malformed ⇒ ignored, never
 * thrown, never a fabricated violation).
 */
function readOptionalJson(path) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function countKitNameCollisions(componentNames, cwd) {
  const inventory = readOptionalJson(join(cwd, 'design', 'kit-inventory.json'))
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  const waivers = readOptionalJson(join(cwd, 'design', 'waivers.json'))
  return findKitNameCollisions(componentNames, { inventory, registry, waivers }).length
}

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

  const kitNameCollisionCount = countKitNameCollisions(componentNames, cwd)

  const receipt = {
    timestamp: now,
    componentNames,
    violationCount: violations.length + kitNameCollisionCount,
    writeCounterAtAudit
  }

  writeDesignJson(cwd, 'audit-receipt.json', receipt)
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
