/**
 * One-time audit nonces — the receipt-fabrication guard.
 *
 * `record-audit-receipt` used to accept any violations JSON on faith, so a
 * session could record a clean receipt without ever running the audit. Now
 * `bundle-design-rules-audit --componentNames [...]` mints a nonce bound to
 * those names (`.argo/audit-pending/<nonce>.json` at the repo root), and the
 * recorder consumes it: missing, expired, name-mismatched, or already-used
 * nonce → the receipt is refused.
 *
 * What this proves: a real audit bundle was generated for THESE components,
 * recently, and at most one receipt was recorded per bundle emission. What it
 * cannot prove: that the violations array wasn't doctored between Figma and
 * the recorder — the audit result rides back through the session's own
 * context. Closing that gap requires the GATE to run the audit itself in a
 * session the working agent doesn't control (the cockpit's design); this
 * nonce is the strongest headless binding available.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const PENDING_SUBDIR = join('.argo', 'audit-pending')
const MAX_AGE_MS = 30 * 60 * 1000

export interface PendingAudit {
  nonce: string
  componentNames: string[]
  issuedAt: number
}

export function issueAuditNonce(
  repoRoot: string,
  componentNames: string[],
  now: number = Date.now()
): PendingAudit {
  const nonce = randomBytes(16).toString('hex')
  const pending: PendingAudit = { nonce, componentNames, issuedAt: now }
  const dir = join(repoRoot, PENDING_SUBDIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${nonce}.json`), JSON.stringify(pending))
  return pending
}

/**
 * Validates and CONSUMES (deletes) the nonce. Returns null on success, or a
 * human-readable refusal reason. `componentNames` must be covered by the
 * nonce's names — a receipt may cover fewer components than were bundled,
 * never more.
 */
export function consumeAuditNonce(
  repoRoot: string,
  nonce: string,
  componentNames: string[],
  now: number = Date.now()
): string | null {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return `malformed nonce "${nonce}"`
  const path = join(repoRoot, PENDING_SUBDIR, `${nonce}.json`)
  if (!existsSync(path)) {
    return `no pending audit for nonce "${nonce}" — run 'argo design bundle-design-rules-audit --componentNames [...]' first (nonces are one-time)`
  }
  let pending: PendingAudit
  try {
    pending = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    rmSync(path, { force: true })
    return `pending audit file for nonce "${nonce}" is unreadable`
  }
  // Consume FIRST — a refused attempt burns the nonce too, so a session
  // cannot probe its way past validation.
  rmSync(path, { force: true })
  if (now - pending.issuedAt > MAX_AGE_MS) {
    return `nonce expired (issued ${Math.round((now - pending.issuedAt) / 60000)}m ago, max 30m) — re-bundle and re-run the audit`
  }
  const missing = componentNames.filter((n) => !pending.componentNames.includes(n))
  if (missing.length > 0) {
    return `nonce was issued for [${pending.componentNames.join(', ')}], not [${missing.join(', ')}] — re-bundle for the components you audited`
  }
  return null
}
