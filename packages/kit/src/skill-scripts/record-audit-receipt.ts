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
import { resolveRepoRoot } from '../lib/repo-root.js'
import { appKeyForCwd, readSessionWriteCount, writeSessionReceiptEntry } from '../lib/session-guard.js'

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
 * while `cwd` keeps governing every app-scoped path (design/, etc).
 */
export function recordAuditReceipt(
  { componentNames = [], violations = [] }: { componentNames?: string[]; violations?: { severity?: string }[] } = {},
  { cwd, now = Date.now(), sessionId = null }: { cwd: string; now?: number; sessionId?: string | null }
) {
  if (!cwd) throw new Error('recordAuditReceipt: cwd is required')

  const repoRoot = resolveRepoRoot(cwd)

  // HARD-only (council ruling Q7, 2026-07-05): advisory findings belong to
  // the sweep report, never the receipt — counting them blocked a clean run
  // on advisory-only stroke-scale hits (the D05 red-gate incident).
  const violationCount = violations.filter((v) => v?.severity !== 'advisory').length

  // Per-session-design-gate.md: when this run is attributed to a session,
  // record into that session's OWN receipt (`.argo/audit-receipts/<sid>.json`),
  // keyed per app, stamped with the session's live write count. Nothing shared
  // is touched, so a concurrent design session can neither clobber this receipt
  // nor be blocked by it. `writeCountAtAudit` reads THIS session's per-session
  // write-count file (0 if the record hook never saw a write for it).
  if (sessionId) {
    const liveWriteCount = readSessionWriteCount(repoRoot, sessionId) ?? 0
    const appKey = appKeyForCwd(repoRoot, cwd)
    return writeSessionReceiptEntry(repoRoot, sessionId, appKey, { componentNames, violationCount }, liveWriteCount, now)
  }

  // Legacy sessionless path: the committed per-app `design/audit-receipt.json`,
  // compared against the repo-global write counter by the stop gate's fallback.
  let writeCounterAtAudit = 0
  const guardStatePath = join(repoRoot, '.argo', 'design-guard.json')
  if (existsSync(guardStatePath)) {
    try {
      const state = JSON.parse(readFileSync(guardStatePath, 'utf8'))
      writeCounterAtAudit = typeof state.writeCount === 'number' ? state.writeCount : 0
    } catch {
      writeCounterAtAudit = 0 // corrupt state — this writer never blocks; the stop gate does
    }
  }

  const receipt = { timestamp: now, componentNames, violationCount, writeCounterAtAudit }
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
  let parsed: any
  try {
    parsed = JSON.parse(json)
  } catch {
    console.error('record-audit-receipt: --record argument is not valid JSON')
    process.exit(1)
  }
  // The record/stop hooks key per-session state by the hook payload's
  // `session_id`; the CLI has no payload, so it reads the same value from
  // `CLAUDE_CODE_SESSION_ID` (verified equal to the payload id). Absent → the
  // legacy committed-receipt path.
  const envSession = process.env.CLAUDE_CODE_SESSION_ID
  const sessionId = typeof envSession === 'string' && envSession.length > 0 ? envSession : null
  const receipt = recordAuditReceipt(parsed, { cwd: process.cwd(), sessionId })
  console.log(JSON.stringify(receipt))
}
