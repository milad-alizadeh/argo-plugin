import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ackPendingWork } from './ack-pending-work.js'
import { readPendingAck } from '../../../../lib/session-guard.js'

describe('ackPendingWork', () => {
  let repo: string
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'argo-ack-pending-work-'))
  })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('rejects an empty reason', () => {
    expect(() => ackPendingWork({ reason: '' }, { cwd: repo, sessionId: 'A' })).toThrow(/reason/)
  })

  it('rejects a missing reason', () => {
    expect(() => ackPendingWork({ reason: undefined as any }, { cwd: repo, sessionId: 'A' })).toThrow(/reason/)
  })

  it('records a valid ack', () => {
    ackPendingWork({ reason: 'deferring contrast fix to a follow-up' }, { cwd: repo, sessionId: 'A', now: 1000 })
    expect(readPendingAck(repo, 'A')).toEqual({
      reason: 'deferring contrast fix to a follow-up',
      ackedAt: 1000,
      writeCountAtAck: 0
    })
  })

  it('a second ack call overwrites the first (one park per session, no history)', () => {
    ackPendingWork({ reason: 'first reason' }, { cwd: repo, sessionId: 'A', now: 1000 })
    ackPendingWork({ reason: 'second reason' }, { cwd: repo, sessionId: 'A', now: 2000 })
    expect(readPendingAck(repo, 'A')?.reason).toBe('second reason')
  })
})
