import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, utimesSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  sessionStatePath,
  sessionReceiptPath,
  appKeyForRoot,
  appKeyForCwd,
  bumpSessionWriteCount,
  readSessionWriteCount,
  writeSessionReceiptEntry,
  readSessionReceipt,
  pruneStaleSessionFiles,
  markScreenComposed,
  recordScreenCompleteness,
  pendingCompletenessScreens,
  pendingAckPath,
  recordPendingAck,
  readPendingAck
} from './session-guard.js'

describe('session-guard — per-session gate state, race-free by namespacing', () => {
  let repo: string
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), 'argo-sessionguard-')) })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('bump creates and increments this session, isolated from other sessions', () => {
    expect(bumpSessionWriteCount(repo, 'A', 1000)).toBe(1)
    expect(bumpSessionWriteCount(repo, 'A', 1001)).toBe(2)
    expect(bumpSessionWriteCount(repo, 'B', 1002)).toBe(1) // B is its own file — A untouched
    expect(readSessionWriteCount(repo, 'A')).toBe(2)
    expect(readSessionWriteCount(repo, 'B')).toBe(1)
  })

  it('readSessionWriteCount is null when the session has no state file', () => {
    expect(readSessionWriteCount(repo, 'never-wrote')).toBeNull()
  })

  it('appKey normalizes "" and "." together; cwd-relative matches root', () => {
    expect(appKeyForRoot('')).toBe('.')
    expect(appKeyForRoot('.')).toBe('.')
    expect(appKeyForRoot('apps/desktop/')).toBe('apps/desktop')
    expect(appKeyForCwd(repo, repo)).toBe('.')
    mkdirSync(join(repo, 'apps', 'desktop'), { recursive: true }) // cwd always exists in real use (realpath needs it)
    expect(appKeyForCwd(repo, join(repo, 'apps', 'desktop'))).toBe('apps/desktop')
  })

  it('receipt entry records per-app, keeps prior apps, refreshes writeCountAtAudit', () => {
    writeSessionReceiptEntry(repo, 'A', 'apps/desktop', { componentNames: ['Button'], violationCount: 0 }, 5, 2000)
    let r = readSessionReceipt(repo, 'A')!
    expect(r.writeCountAtAudit).toBe(5)
    expect(r.apps['apps/desktop']).toEqual({ componentNames: ['Button'], violationCount: 0 })

    writeSessionReceiptEntry(repo, 'A', 'apps/other', { componentNames: ['Card'], violationCount: 2 }, 6, 2001)
    r = readSessionReceipt(repo, 'A')!
    expect(r.writeCountAtAudit).toBe(6) // refreshed
    expect(r.apps['apps/desktop']).toEqual({ componentNames: ['Button'], violationCount: 0 }) // kept
    expect(r.apps['apps/other'].violationCount).toBe(2)
  })

  it('one session receipt never touches another session receipt', () => {
    writeSessionReceiptEntry(repo, 'A', '.', { componentNames: [], violationCount: 0 }, 3, 3000)
    expect(readSessionReceipt(repo, 'B')).toBeUndefined()
    expect(existsSync(sessionReceiptPath(repo, 'A'))).toBe(true)
    expect(existsSync(sessionStatePath(repo, 'A'))).toBe(false) // receipt and state are separate files
  })

  it('prune removes files older than maxAge, keeps recent ones', () => {
    bumpSessionWriteCount(repo, 'old', 1)
    bumpSessionWriteCount(repo, 'recent', 2)
    const oldPath = sessionStatePath(repo, 'old')
    const staleSecs = Date.now() / 1000 - 30 * 24 * 60 * 60 // 30 days ago
    utimesSync(oldPath, staleSecs, staleSecs)
    pruneStaleSessionFiles(repo, Date.now())
    expect(existsSync(oldPath)).toBe(false)
    expect(existsSync(sessionStatePath(repo, 'recent'))).toBe(true)
  })

  it('prune is a no-op (no throw) when the dirs do not exist', () => {
    expect(() => pruneStaleSessionFiles(join(repo, 'nope'), Date.now())).not.toThrow()
  })

  describe('P4b completeness tracking', () => {
    it('a composed screen is pending until its completeness is recorded', () => {
      markScreenComposed(repo, 'A', 'first-run', 1000)
      expect(pendingCompletenessScreens(repo, 'A')).toEqual(['first-run'])
      recordScreenCompleteness(repo, 'A', 'first-run', 1001)
      expect(pendingCompletenessScreens(repo, 'A')).toEqual([])
    })

    it('re-composing a screen re-owes the check (recordedAt reset)', () => {
      markScreenComposed(repo, 'A', 'first-run', 1000)
      recordScreenCompleteness(repo, 'A', 'first-run', 1001)
      expect(pendingCompletenessScreens(repo, 'A')).toEqual([])
      markScreenComposed(repo, 'A', 'first-run', 1002) // built again → stale check
      expect(pendingCompletenessScreens(repo, 'A')).toEqual(['first-run'])
    })

    it('tracks multiple screens independently and is isolated per session', () => {
      markScreenComposed(repo, 'A', 'first-run', 1000)
      markScreenComposed(repo, 'A', 'cockpit-main', 1000)
      recordScreenCompleteness(repo, 'A', 'first-run', 1001)
      expect(pendingCompletenessScreens(repo, 'A')).toEqual(['cockpit-main'])
      expect(pendingCompletenessScreens(repo, 'B')).toEqual([]) // B never composed anything
    })

    it('pending is empty for a session that composed nothing', () => {
      expect(pendingCompletenessScreens(repo, 'never')).toEqual([])
    })
  })

  describe('pending-ack affordance (Slice 14 — park with acknowledged pending work)', () => {
    it('records and reads back an ack with the reason, timestamp, and write count at ack time', () => {
      bumpSessionWriteCount(repo, 'A', 1000) // write count is now 1
      recordPendingAck(repo, 'A', 'deferring the contrast fix to a follow-up', 2000)
      expect(readPendingAck(repo, 'A')).toEqual({
        reason: 'deferring the contrast fix to a follow-up',
        ackedAt: 2000,
        writeCountAtAck: 1
      })
      expect(existsSync(pendingAckPath(repo, 'A'))).toBe(true)
    })

    it('returns undefined for a session with no ack', () => {
      expect(readPendingAck(repo, 'never')).toBeUndefined()
    })

    it('is isolated per session', () => {
      recordPendingAck(repo, 'A', 'reason A', 1000)
      expect(readPendingAck(repo, 'B')).toBeUndefined()
    })
  })
})
