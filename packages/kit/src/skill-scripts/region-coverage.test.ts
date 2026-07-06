import { describe, it, expect } from 'vitest'
import { lintRegionCoverage } from './region-coverage.js'

describe('lintRegionCoverage (P2 brief<->wireframe reconciliation lint, pre-Figma)', () => {
  it('is ok when every contract region has a disposition row', () => {
    const contract = {
      screen: 'cockpit-shell',
      regions: [{ name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] }]
    }
    const dispositions = [{ region: 'BuildSpine', disposition: 'built-here', component: 'BuildSpine', verdict: 'NEW' }]

    expect(lintRegionCoverage(contract, dispositions)).toEqual({ ok: true, unaccounted: [] })
  })

  it('is not ok, and names the region, when a contract region has no disposition row', () => {
    const contract = {
      screen: 'cockpit-shell',
      regions: [
        { name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] },
        { name: 'DiffPanel', path: 'DiffPanel', depth: 1, children: [] }
      ]
    }
    const dispositions = [{ region: 'BuildSpine', disposition: 'built-here', component: 'BuildSpine', verdict: 'NEW' }]

    expect(lintRegionCoverage(contract, dispositions)).toEqual({ ok: false, unaccounted: ['DiffPanel'] })
  })
})
