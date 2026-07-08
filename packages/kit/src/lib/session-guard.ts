/**
 * Per-session design-guard state (per-session-design-gate.md).
 *
 * Lets independent design sessions write the same Figma file without
 * deadlocking each other's stop gate. The old model kept ONE shared, mutable
 * `.argo/design-guard.json` (a read-modify-write the record hook raced across
 * sessions → lost updates) and ONE committed `design/audit-receipt.json`
 * (whoever recorded last clobbered the other). Here every session writes ONLY
 * files namespaced to its own `session_id`, so there is no shared mutable
 * state to race or clobber:
 *
 *   .argo/design-guard/<sid>.json    — this session's write count
 *   .argo/audit-receipts/<sid>.json  — this session's audit result, per app
 *
 * Both live under the already-gitignored `.argo/` (local gate evidence, never
 * committed). All helpers are pure over the filesystem and unit-tested in a
 * temp dir.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'

function canonical(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

const GUARD_SUBDIR = join('.argo', 'design-guard')
const RECEIPT_SUBDIR = join('.argo', 'audit-receipts')
const COMPLETENESS_SUBDIR = join('.argo', 'completeness')
const PENDING_ACK_SUBDIR = join('.argo', 'pending-ack')
const PRUNE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export function sessionStatePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, GUARD_SUBDIR, `${sessionId}.json`)
}

export function sessionReceiptPath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, RECEIPT_SUBDIR, `${sessionId}.json`)
}

export function readJsonSafe(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** The repo-root-relative app key both the writer (from cwd) and the stop gate
 * (from the design block's `root`) must agree on. `''`/`.` normalize together. */
export function appKeyForRoot(root: string | undefined | null): string {
  const r = (root ?? '.').replace(/\/+$/, '')
  return r === '' ? '.' : r
}

export function appKeyForCwd(repoRoot: string, cwd: string): string {
  // realpath both sides: resolveRepoRoot returns git's canonical path while cwd
  // may be a symlink (macOS /var → /private/var), and a raw relative() of the
  // two would produce garbage that never matches the config's `root`.
  return appKeyForRoot(relative(canonical(repoRoot), canonical(cwd)) || '.')
}

/** Increment (and create) this session's own write-count file. No other session
 * ever writes this path, so a plain write is race-free by construction. */
export function bumpSessionWriteCount(repoRoot: string, sessionId: string, now: number): number {
  const path = sessionStatePath(repoRoot, sessionId)
  const prior = readJsonSafe(path)
  const writeCount = (typeof prior?.writeCount === 'number' ? prior.writeCount : 0) + 1
  mkdirSync(join(repoRoot, GUARD_SUBDIR), { recursive: true })
  writeFileSync(path, JSON.stringify({ writeCount, lastWriteAt: now }))
  return writeCount
}

/** This session's current write count, or null if it has no state file (a
 * session that made no post-upgrade writes → the caller falls back to legacy). */
export function readSessionWriteCount(repoRoot: string, sessionId: string): number | null {
  const state = readJsonSafe(sessionStatePath(repoRoot, sessionId))
  if (!state) return null
  return typeof state.writeCount === 'number' ? state.writeCount : 0
}

type SessionReceipt = {
  timestamp: number
  writeCountAtAudit: number
  apps: Record<string, { componentNames: string[]; violationCount: number }>
}

/** Record this session's audit of one app into its own receipt file
 * (read-modify-write of a file only this session writes → race-free). Keeps
 * prior apps' entries; refreshes writeCountAtAudit to the session's live count. */
export function writeSessionReceiptEntry(
  repoRoot: string,
  sessionId: string,
  appKey: string,
  entry: { componentNames: string[]; violationCount: number },
  liveWriteCount: number,
  now: number
): SessionReceipt {
  const path = sessionReceiptPath(repoRoot, sessionId)
  const prior = readJsonSafe(path)
  const apps = prior?.apps && typeof prior.apps === 'object' ? prior.apps : {}
  apps[appKey] = { componentNames: entry.componentNames, violationCount: entry.violationCount }
  const receipt: SessionReceipt = { timestamp: now, writeCountAtAudit: liveWriteCount, apps }
  mkdirSync(join(repoRoot, RECEIPT_SUBDIR), { recursive: true })
  writeFileSync(path, JSON.stringify(receipt))
  return receipt
}

export function readSessionReceipt(repoRoot: string, sessionId: string): SessionReceipt | undefined {
  const r = readJsonSafe(sessionReceiptPath(repoRoot, sessionId))
  if (!r || typeof r !== 'object') return undefined
  return r as SessionReceipt
}

// --- P4b completeness tracking (design-process-simplification.md) -----------
// Per-session record of which screens this session COMPOSED and whether each
// one's advisory completeness check (P4b design-verifier) has been RECORDED.
// The stop gate blocks on a composed screen whose check never ran (existence
// only — never on what the check found). Same per-session namespacing as the
// write count/receipt, so concurrent design sessions never gate each other.

export function completenessStatePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, COMPLETENESS_SUBDIR, `${sessionId}.json`)
}

type CompletenessState = { screens: Record<string, { composedAt: number; recordedAt: number | null }> }

function readCompletenessState(repoRoot: string, sessionId: string): CompletenessState {
  const prior = readJsonSafe(completenessStatePath(repoRoot, sessionId))
  return prior?.screens && typeof prior.screens === 'object' ? (prior as CompletenessState) : { screens: {} }
}

function writeCompletenessState(repoRoot: string, sessionId: string, state: CompletenessState): void {
  mkdirSync(join(repoRoot, COMPLETENESS_SUBDIR), { recursive: true })
  writeFileSync(completenessStatePath(repoRoot, sessionId), JSON.stringify(state))
}

/** Mark a screen as composed → its completeness check is now OWED. Re-composing
 * a screen resets `recordedAt` to null (the prior check is stale against the new
 * build), so the check must run again. */
export function markScreenComposed(repoRoot: string, sessionId: string, screen: string, now: number): void {
  const state = readCompletenessState(repoRoot, sessionId)
  state.screens[screen] = { composedAt: now, recordedAt: null }
  writeCompletenessState(repoRoot, sessionId, state)
}

/** Record that the completeness check RAN for a screen (existence proof; the
 * result content is not stored here — the gate is content-free). A record for a
 * screen never marked composed still lands (harmless), so ordering is forgiving. */
export function recordScreenCompleteness(repoRoot: string, sessionId: string, screen: string, now: number): void {
  const state = readCompletenessState(repoRoot, sessionId)
  const prior = state.screens[screen]
  state.screens[screen] = { composedAt: prior?.composedAt ?? now, recordedAt: now }
  writeCompletenessState(repoRoot, sessionId, state)
}

/** Screens this session composed whose completeness check has not been recorded
 * (or was invalidated by a re-compose). Empty when nothing is owed. */
export function pendingCompletenessScreens(repoRoot: string, sessionId: string): string[] {
  const state = readCompletenessState(repoRoot, sessionId)
  return Object.entries(state.screens)
    .filter(([, s]) => s.recordedAt === null)
    .map(([screen]) => screen)
}

// --- Slice 14: "park with acknowledged pending work" affordance -------------
// A stop-gate escape hatch, not a new workflow: one session-scoped
// acknowledgment file, checked by the stop gate BEFORE its normal blocking
// logic. One ack covers every outstanding write-owed debt in the session it's
// recorded for; a NEW write after the ack re-arms the gate (the stop gate
// compares `writeCountAtAck` against the session's LIVE write count), so this
// can't be used to permanently silence the gate.

export function pendingAckPath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, PENDING_ACK_SUBDIR, `${sessionId}.json`)
}

/** Owner-acknowledged deferred work for this session — a real reason string,
 * never a blank rubber stamp (the CLI/stop-gate caller rejects an empty
 * string before this is ever called). */
export function recordPendingAck(repoRoot: string, sessionId: string, reason: string, now: number): void {
  mkdirSync(join(repoRoot, PENDING_ACK_SUBDIR), { recursive: true })
  writeFileSync(
    pendingAckPath(repoRoot, sessionId),
    JSON.stringify({ reason, ackedAt: now, writeCountAtAck: readSessionWriteCount(repoRoot, sessionId) ?? 0 })
  )
}

export function readPendingAck(repoRoot: string, sessionId: string): { reason: string; ackedAt: number; writeCountAtAck: number } | undefined {
  return readJsonSafe(pendingAckPath(repoRoot, sessionId))
}

/** Best-effort prune of per-session files older than 14 days. Delete-if-old is
 * idempotent, so two sessions pruning the same dir concurrently is harmless. */
export function pruneStaleSessionFiles(repoRoot: string, now: number, maxAgeMs: number = PRUNE_MAX_AGE_MS): void {
  for (const sub of [GUARD_SUBDIR, RECEIPT_SUBDIR, COMPLETENESS_SUBDIR, PENDING_ACK_SUBDIR]) {
    const dir = join(repoRoot, sub)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.json')) continue
      const p = join(dir, name)
      try {
        if (now - statSync(p).mtimeMs > maxAgeMs) unlinkSync(p)
      } catch {
        /* gone already / concurrent prune — ignore */
      }
    }
  }
}
