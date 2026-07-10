#!/usr/bin/env node
// Writes the receipt the stop gate checks before ending a session. Derived, never
// hand-authored — the one place a use_figma audit result becomes the receipt shape.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { writeDesignJson } from '../lib/write-design-json.js'
import { consumeAuditNonce } from '../session-guard/lib/audit-nonce.js'
import { resolveRepoRoot } from '../../../../lib/repo-root.js'
import { appKeyForCwd, readSessionWriteCount, writeSessionReceiptEntry } from '../../../../lib/session-guard.js'

// writeCounterAtAudit lets the stop gate detect a write after this audit ran and
// demand a re-audit. .argo/design-guard.json is repo-global (git toplevel), NOT
// necessarily cwd (a monorepo app root) — reading both off the same cwd silently
// missed the guard state in that layout, so this reads it via resolveRepoRoot
// while cwd keeps governing app-scoped paths.
export function recordAuditReceipt(
  { componentNames = [], violations }: { componentNames?: string[]; violations?: { severity?: string }[] } = {},
  { cwd, now = Date.now(), sessionId = null }: { cwd: string; now?: number; sessionId?: string | null }
) {
  if (!cwd) throw new Error('recordAuditReceipt: cwd is required')
  // The nonce only binds componentNames — requiring a real violations array (even
  // empty) closes the gap where a caller could omit it and record a false-clean receipt.
  if (!Array.isArray(violations)) {
    throw new Error('recordAuditReceipt: violations is required and must be an array (an omitted field is not a clean audit)')
  }

  const repoRoot = resolveRepoRoot(cwd)

  // HARD-only: advisory findings belong to the sweep report, never the
  // receipt — counting them would block an otherwise-clean run on
  // advisory-only stroke-scale hits.
  const violationCount = violations.filter((v) => v?.severity !== 'advisory').length
  // Binds the receipt to the actual violations content so two receipts covering the
  // same names but different findings are distinguishable on disk. Does NOT prove
  // the violations came from a real use_figma run — that residual gap needs the
  // cockpit to run the audit itself.
  const violationsDigest = createHash('sha256').update(JSON.stringify(violations)).digest('hex')

  // Attributed to a session: record into that session's own per-app receipt so a
  // concurrent design session can neither clobber nor be blocked by this one.
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

  const receipt = { timestamp: now, componentNames, violationCount, violationsDigest, writeCounterAtAudit }
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
  // Receipt-fabrication guard: refuses a receipt without a fresh, name-matching
  // nonce, so a session can't record "clean" without a real bundle having run.
  if (typeof parsed?.nonce !== 'string') {
    console.error(
      'record-audit-receipt: --record JSON must carry the "nonce" from the bundle-design-rules-audit emission that produced this audit run'
    )
    process.exit(1)
  }
  const nonceRefusal = consumeAuditNonce(
    resolveRepoRoot(process.cwd()),
    parsed.nonce,
    Array.isArray(parsed.componentNames) ? parsed.componentNames : []
  )
  if (nonceRefusal) {
    console.error(`record-audit-receipt: REFUSED — ${nonceRefusal}`)
    process.exit(1)
  }
  // The record/stop hooks key per-session state by the hook payload's
  // `session_id`; the CLI has no payload, so it reads the same value from
  // `CLAUDE_CODE_SESSION_ID` (verified equal to the payload id). Absent → the
  // legacy committed-receipt path.
  const envSession = process.env.CLAUDE_CODE_SESSION_ID
  const sessionId = typeof envSession === 'string' && envSession.length > 0 ? envSession : null
  try {
    const receipt = recordAuditReceipt(parsed, { cwd: process.cwd(), sessionId })
    console.log(JSON.stringify(receipt))
  } catch (err: any) {
    console.error(`record-audit-receipt: REFUSED — ${err.message}`)
    process.exit(1)
  }
}
