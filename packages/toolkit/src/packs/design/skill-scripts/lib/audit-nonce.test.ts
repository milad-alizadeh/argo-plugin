import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { consumeAuditNonce, issueAuditNonce } from './audit-nonce.js'

describe('audit nonce — receipt fabrication guard', () => {
  it('issue then consume succeeds once, and only once', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-nonce-'))
    const { nonce } = issueAuditNonce(root, ['SessionCard'])

    expect(consumeAuditNonce(root, nonce, ['SessionCard'])).toBeNull()
    // Second use: burned.
    expect(consumeAuditNonce(root, nonce, ['SessionCard'])).toMatch(/no pending audit/)
  })

  it('refuses a nonce that was never issued', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-nonce-'))
    expect(consumeAuditNonce(root, 'a'.repeat(32), ['SessionCard'])).toMatch(/no pending audit/)
    expect(consumeAuditNonce(root, 'not-a-nonce', ['SessionCard'])).toMatch(/malformed/)
  })

  it('refuses names the nonce was not issued for, and burns the nonce on refusal', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-nonce-'))
    const { nonce } = issueAuditNonce(root, ['Card'])

    expect(consumeAuditNonce(root, nonce, ['SessionCard'])).toMatch(/issued for \[Card\]/)
    // Probing burned it.
    expect(consumeAuditNonce(root, nonce, ['Card'])).toMatch(/no pending audit/)
  })

  it('allows a receipt covering FEWER components than bundled, never more', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-nonce-'))
    const { nonce } = issueAuditNonce(root, ['Card', 'SessionCard'])
    expect(consumeAuditNonce(root, nonce, ['SessionCard'])).toBeNull()
  })

  it('refuses an expired nonce', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-nonce-'))
    const issuedAt = Date.now()
    const { nonce } = issueAuditNonce(root, ['SessionCard'], issuedAt)
    expect(consumeAuditNonce(root, nonce, ['SessionCard'], issuedAt + 31 * 60 * 1000)).toMatch(/expired/)
  })
})
