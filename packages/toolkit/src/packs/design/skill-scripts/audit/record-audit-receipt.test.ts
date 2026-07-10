import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { recordAuditReceipt } from './record-audit-receipt.js'

describe('recordAuditReceipt', () => {
  it('writes design/audit-receipt.json with the violation count and timestamp', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-'))
    try {
      const receipt = recordAuditReceipt({ componentNames: ['Button'], violations: [] }, { cwd, now: 123 })
      expect(receipt.violationCount).toBe(0)
      expect(receipt.timestamp).toBe(123)
      const onDisk = JSON.parse(readFileSync(join(cwd, 'design', 'audit-receipt.json'), 'utf8'))
      expect(onDisk).toEqual(receipt)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // The receipt is HARD-only — advisory findings live in the sweep report,
  // never in violationCount. Otherwise an advisory-only run would block the
  // stop gate (e.g. a handful of advisory stroke-scale hits leaving the
  // gate red with no hard violation to fix).
  it('excludes advisory-severity findings from violationCount (hard-only receipt)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-'))
    try {
      const receipt = recordAuditReceipt(
        {
          componentNames: ['Button'],
          violations: [
            { severity: 'advisory', rule: 'stroke-scale-mismatch', detail: 'x' },
            { severity: 'hard', rule: 'unbound-fill', detail: 'y' }
          ]
        },
        { cwd, now: 123 }
      )
      expect(receipt.violationCount).toBe(1)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // Forgery guard: the nonce only ever bound componentNames, so a caller
  // could omit `violations` entirely (silently defaulting to []) and record
  // a clean receipt for an audit that actually found violations. Requiring
  // `violations` and binding a digest of its real content closes that.
  it('refuses to record when violations is missing (prevents silently forging a clean receipt)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-'))
    try {
      expect(() => recordAuditReceipt({ componentNames: ['Button'] } as any, { cwd, now: 123 })).toThrow(/violations/)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('binds the receipt to a hash of the actual violations payload', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-'))
    try {
      const receiptA = recordAuditReceipt(
        { componentNames: ['Button'], violations: [{ severity: 'hard', rule: 'unbound-fill' }] },
        { cwd, now: 123 }
      )
      const receiptB = recordAuditReceipt({ componentNames: ['Button'], violations: [] }, { cwd, now: 123 })
      expect(receiptA.violationsDigest).toMatch(/^[0-9a-f]{64}$/)
      expect(receiptA.violationsDigest).not.toBe(receiptB.violationsDigest)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // violationCount is hard audit violations ONLY — a stale kit-inventory.json on
  // disk contributes nothing.
  it('ignores a leftover design/kit-inventory.json entirely (violationCount = hard violations only)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(
        join(cwd, 'design', 'kit-inventory.json'),
        JSON.stringify({ components: [{ name: 'Collapsible', aliases: ['accordion'] }] })
      )
      const receipt = recordAuditReceipt({ componentNames: ['Collapsible'], violations: [] }, { cwd, now: 123 })
      expect(receipt.violationCount).toBe(0)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // A monorepo runs this from a nested app root, but design-guard.json is
  // repo-global at the git toplevel — reading it relative to the same cwd used
  // for design/ silently missed the file, leaving the stop gate permanently blocked.
  it('reads .argo/design-guard.json from the git repo root, not the app-scoped cwd', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-monorepo-'))
    try {
      execFileSync('git', ['-C', repoRoot, 'init', '-q'])
      const appRoot = join(repoRoot, 'apps', 'web')
      mkdirSync(appRoot, { recursive: true })
      mkdirSync(join(repoRoot, '.argo'), { recursive: true })
      writeFileSync(join(repoRoot, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 175 }))

      const receipt = recordAuditReceipt({ componentNames: [], violations: [] }, { cwd: appRoot, now: 123 })

      expect(receipt.writeCounterAtAudit).toBe(175)
      const onDisk = JSON.parse(readFileSync(join(appRoot, 'design', 'audit-receipt.json'), 'utf8'))
      expect(onDisk).toEqual(receipt)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  // With a session id, the receipt is per-session and local, keyed per app and
  // stamped with this session's live write count — never the committed per-app
  // file, so concurrent sessions can't clobber each other.
  it('with a session id, writes a per-session receipt (apps + live write count), not the committed one', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'design-rules-audit-receipt-persession-'))
    try {
      execFileSync('git', ['-C', repoRoot, 'init', '-q'])
      const appRoot = join(repoRoot, 'apps', 'web')
      mkdirSync(appRoot, { recursive: true })
      // this session's own write-count file says it made 7 writes
      mkdirSync(join(repoRoot, '.argo', 'design-guard'), { recursive: true })
      writeFileSync(join(repoRoot, '.argo', 'design-guard', 'mine.json'), JSON.stringify({ writeCount: 7, lastWriteAt: 1 }))

      const receipt: any = recordAuditReceipt(
        { componentNames: ['Button'], violations: [] },
        { cwd: appRoot, now: 123, sessionId: 'mine' }
      )

      expect(receipt.writeCountAtAudit).toBe(7)
      expect(receipt.apps['apps/web']).toEqual({ componentNames: ['Button'], violationCount: 0 })
      const onDisk = JSON.parse(readFileSync(join(repoRoot, '.argo', 'audit-receipts', 'mine.json'), 'utf8'))
      expect(onDisk).toEqual(receipt)
      // the committed per-app receipt is NOT written on the per-session path
      expect(existsSync(join(appRoot, 'design', 'audit-receipt.json'))).toBe(false)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
