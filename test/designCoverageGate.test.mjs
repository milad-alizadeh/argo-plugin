import { describe, it, expect } from 'vitest'
import { evaluateCoverageReceipt } from '../hooks/design-coverage-gate.mjs'

describe('evaluateCoverageReceipt (design-coverage-gate.mjs decision predicate)', () => {
  it('passes a clean, fresh, non-compose receipt matching the contract figmaFileVersion', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result).toEqual({ ok: true })
  })

  it('rejects a receipt produced by "compose" (P4 self-check is advisory-only, never the receipt of record)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'compose', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt that is not clean (UNACCOUNTED or MISSING regions present)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: false }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt whose figmaFileVersion disagrees with the current contract (stale against its own source)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '41', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt older than the staleness window', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 0, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 11 * 60 * 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects when there is no receipt at all', () => {
    const result = evaluateCoverageReceipt(null, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })
})
