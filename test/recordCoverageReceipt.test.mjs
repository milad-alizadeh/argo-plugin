import { describe, it, expect } from 'vitest'
import { buildCoverageReceipt, coverageReceiptFilename } from '../scripts/record-coverage-receipt.mjs'

describe('buildCoverageReceipt (P5 compose-time coverage receipt shape)', () => {
  it('stamps a clean receipt from a fully-instanced built tree', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] }]
    }
    const builtRegions = [{ name: 'BuildSpine', path: 'BuildSpine', isInstance: true, instanceOf: 'BuildSpine' }]

    const receipt = buildCoverageReceipt({
      contract,
      builtRegions,
      dispositions: [],
      producedBy: 'design-verifier',
      now: 123
    })

    expect(receipt).toEqual({
      screen: 'cockpit-shell',
      producedBy: 'design-verifier',
      figmaFileVersion: '42',
      timestamp: 123,
      summary: { present: ['BuildSpine'], deferred: [], UNACCOUNTED: [], MISSING: [], warnings: [], clean: true },
      clean: true
    })
  })

  it('stamps clean:false when a contract region is UNACCOUNTED', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'DiffPanel', path: 'DiffPanel', depth: 1, children: [] }]
    }

    const receipt = buildCoverageReceipt({ contract, builtRegions: [], dispositions: [], producedBy: 'design-verifier', now: 456 })

    expect(receipt.clean).toBe(false)
    expect(receipt.summary.UNACCOUNTED).toEqual(['DiffPanel'])
  })
})

describe('coverageReceiptFilename (C2: screen-scope the receipt path)', () => {
  it('names the receipt file after the screen, not a fixed coverage-receipt.json', () => {
    expect(coverageReceiptFilename('cockpit-shell')).toBe('coverage-receipt-cockpit-shell.json')
  })
})
