/** Every session writes ONLY files namespaced to its own session_id, so
 * concurrent design sessions never race or clobber shared mutable state. */

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

/** Read-modify-write of a file only this session writes, so it's race-free. */
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

// The stop gate blocks on a composed screen whose completeness check never
// ran (existence only, never on what the check found).

export function completenessStatePath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, COMPLETENESS_SUBDIR, `${sessionId}.json`)
}

type CompletenessState = { screens: Record<string, { composedAt: number; recordedAt: number | null; label?: string }> }

/** Composed FRAME names and PRD matrix names differ; normalize both to one key
 * so the stop gate never deadlocks on a naming-convention mismatch. */
export function normalizeScreenKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readCompletenessState(repoRoot: string, sessionId: string): CompletenessState {
  const prior = readJsonSafe(completenessStatePath(repoRoot, sessionId))
  return prior?.screens && typeof prior.screens === 'object' ? (prior as CompletenessState) : { screens: {} }
}

function writeCompletenessState(repoRoot: string, sessionId: string, state: CompletenessState): void {
  mkdirSync(join(repoRoot, COMPLETENESS_SUBDIR), { recursive: true })
  writeFileSync(completenessStatePath(repoRoot, sessionId), JSON.stringify(state))
}

/** Marks a screen composed, so its completeness check is OWED. Re-composing
 * resets `recordedAt` to null since the prior check is now stale. */
export function markScreenComposed(repoRoot: string, sessionId: string, screen: string, now: number): void {
  const state = readCompletenessState(repoRoot, sessionId)
  const key = normalizeScreenKey(screen)
  state.screens[key] = { composedAt: now, recordedAt: null, label: screen }
  writeCompletenessState(repoRoot, sessionId, state)
}

/** Records only that the check ran (existence proof, gate is content-free);
 * a record for a screen never marked composed still lands harmlessly. */
export function recordScreenCompleteness(repoRoot: string, sessionId: string, screen: string, now: number): void {
  const state = readCompletenessState(repoRoot, sessionId)
  const key = normalizeScreenKey(screen)
  const prior = state.screens[key]
  state.screens[key] = { composedAt: prior?.composedAt ?? now, recordedAt: now, label: prior?.label ?? screen }
  writeCompletenessState(repoRoot, sessionId, state)
}

/** Screens this session composed whose completeness check has not been recorded
 * (or was invalidated by a re-compose). Empty when nothing is owed. */
export function pendingCompletenessScreens(repoRoot: string, sessionId: string): string[] {
  const state = readCompletenessState(repoRoot, sessionId)
  return Object.entries(state.screens)
    .filter(([, s]) => s.recordedAt === null)
    .map(([key, s]) => s.label ?? key)
}

// A new write after the ack re-arms the gate, so this can't permanently
// silence it.

export function pendingAckPath(repoRoot: string, sessionId: string): string {
  return join(repoRoot, PENDING_ACK_SUBDIR, `${sessionId}.json`)
}

/** Requires a real reason string; the caller rejects an empty one before
 * this is ever called. */
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
