#!/usr/bin/env node
/**
 * Writes `design/audit-receipt.json` — the deterministic proof
 * design-guard-stop.js checks before it lets a session end. Derived, never
 * hand-authored: this is the ONE place that turns a `use_figma`-returned
 * tier0-audit result (the `runTier0Audit` completion value, an array of
 * `{ severity, rule, nodeId, nodeName, detail }`) into the receipt shape.
 *
 * A sibling of bundle-tier0-audit.js (figma-audit/SKILL.md's procedure
 * documents this as its final step, run right after `use_figma` returns the
 * audit's violations array): `argo design record-audit-receipt --record
 * '<json>'`, where `<json>` is `{ componentNames, violations }`.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeDesignJson } from './lib/write-design-json.js'
import { findKitNameCollisions } from '../design-kit/kit-inventory.js'
import { resolveRepoRoot } from '../lib/repo-root.js'

/**
 * kit-awareness (kit-awareness.md §"Enforcement"): reads the three optional,
 * project-committed files a collision check needs and folds any unwaived
 * match into the receipt's violationCount — riding the existing
 * design-guard-stop.js rail rather than a new hook (the Figma sandbox can't
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
 * design-guard-stop.js can detect a write that happened after this audit
 * ran, and demand a re-audit. `.argo/design-guard.json` is repo-global and
 * lives at the git toplevel — NOT necessarily `cwd`, which in a monorepo is
 * the app root (e.g. `apps/desktop`, per figma-audit/SKILL.md's documented
 * cwd, matching where `design/audit-receipt.json` itself must land for
 * design-guard-stop.js to find it). Reading both off the same `cwd` silently
 * missed the guard state in that layout, defaulting `writeCounterAtAudit`
 * to 0 forever — resolveRepoRoot finds the real repo root for this one read
 * while `cwd` keeps governing every app-scoped path (design/, kit-inventory,
 * etc).
 */
export function recordAuditReceipt({ componentNames = [], violations = [] } = {}, { cwd, now = Date.now() } = {}) {
  if (!cwd) throw new Error('recordAuditReceipt: cwd is required')

  let writeCounterAtAudit = 0
  const guardStatePath = join(resolveRepoRoot(cwd), '.argo', 'design-guard.json')
  if (existsSync(guardStatePath)) {
    try {
      const state = JSON.parse(readFileSync(guardStatePath, 'utf8'))
      writeCounterAtAudit = typeof state.writeCount === 'number' ? state.writeCount : 0
    } catch {
      writeCounterAtAudit = 0 // corrupt state — this writer never blocks; the stop gate does
    }
  }

  const kitNameCollisionCount = countKitNameCollisions(componentNames, cwd)

  // HARD-only (council ruling Q7, 2026-07-05): advisory findings belong to
  // the sweep report, never the receipt — counting them blocked a clean run
  // on advisory-only stroke-scale hits (the D05 red-gate incident).
  const hardViolations = violations.filter((v) => v?.severity !== 'advisory')

  const receipt = {
    timestamp: now,
    componentNames,
    violationCount: hardViolations.length + kitNameCollisionCount,
    writeCounterAtAudit
  }

  writeDesignJson(cwd, 'audit-receipt.json', receipt)
  return receipt
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const recordIndex = args.indexOf('--record')
  if (recordIndex === -1) {
    console.error('record-audit-receipt: usage: argo design record-audit-receipt --record \'{"componentNames":[...],"violations":[...]}\'')
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
