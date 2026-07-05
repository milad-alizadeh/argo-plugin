import { describe, it, expect } from 'vitest'
import { classifyCoverage, summarize, reconcileBrief } from '../packages/figma-design-kit/region-contract.js'

describe('classifyCoverage', () => {
  it('classifies a contract region as present when matched by a registry-backed instance', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] }]
    }
    const builtRegions = [{ name: 'BuildSpine', path: 'BuildSpine', isInstance: true, instanceOf: 'BuildSpine' }]

    const classification = classifyCoverage(contract, builtRegions, [])

    expect(classification).toEqual([{ name: 'BuildSpine', path: 'BuildSpine', status: 'present' }])
  })

  it('classifies a contract region as UNACCOUNTED when neither a built instance nor a disposition row exists', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'DiffPanel', path: 'DiffPanel', depth: 1, children: [] }]
    }

    const classification = classifyCoverage(contract, [], [])

    expect(classification).toEqual([{ name: 'DiffPanel', path: 'DiffPanel', status: 'UNACCOUNTED' }])
  })

  it('classifies a region matched only by a non-instance built node as MISSING (hollow bare-frame trace)', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'LensBar', path: 'LensBar', depth: 1, children: [] }]
    }
    const builtRegions = [{ name: 'LensBar', path: 'LensBar', isInstance: false }]
    const dispositions = [{ region: 'LensBar', disposition: 'built-here', component: 'LensBar', verdict: 'NEW' }]

    const classification = classifyCoverage(contract, builtRegions, dispositions)

    expect(classification).toEqual([{ name: 'LensBar', path: 'LensBar', status: 'MISSING' }])
  })

  it('classifies a region with a deferred-to-<target> disposition as deferred', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'VoiceSwitch', path: 'VoiceSwitch', depth: 1, children: [] }]
    }
    const dispositions = [{ region: 'VoiceSwitch', disposition: 'deferred-to-wave-2', target: 'wave-2', reason: 'not yet designed' }]

    const classification = classifyCoverage(contract, [], dispositions)

    expect(classification).toEqual([{ name: 'VoiceSwitch', path: 'VoiceSwitch', status: 'deferred' }])
  })
})

describe('summarize', () => {
  it('is clean when there are no UNACCOUNTED or MISSING regions', () => {
    const classification = [
      { name: 'BuildSpine', path: 'BuildSpine', status: 'present' },
      { name: 'VoiceSwitch', path: 'VoiceSwitch', status: 'deferred' }
    ]

    expect(summarize(classification)).toEqual({
      present: ['BuildSpine'],
      deferred: ['VoiceSwitch'],
      UNACCOUNTED: [],
      MISSING: [],
      clean: true
    })
  })

  it('is not clean when any region is UNACCOUNTED or MISSING', () => {
    const classification = [
      { name: 'BuildSpine', path: 'BuildSpine', status: 'present' },
      { name: 'DiffPanel', path: 'DiffPanel', status: 'UNACCOUNTED' },
      { name: 'LensBar', path: 'LensBar', status: 'MISSING' }
    ]

    expect(summarize(classification)).toEqual({
      present: ['BuildSpine'],
      deferred: [],
      UNACCOUNTED: ['DiffPanel'],
      MISSING: ['LensBar'],
      clean: false
    })
  })
})

describe('reconcileBrief (P2 pre-Figma lint: every contract region needs a disposition row)', () => {
  it('is ok when every contract region has a disposition row', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] }]
    }
    const dispositions = [{ region: 'BuildSpine', disposition: 'built-here', component: 'BuildSpine', verdict: 'NEW' }]

    expect(reconcileBrief(contract, dispositions)).toEqual({ ok: true, unaccounted: [] })
  })

  it('is not ok, and names the region, when a contract region has no disposition row', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [
        { name: 'BuildSpine', path: 'BuildSpine', depth: 1, children: [] },
        { name: 'DiffPanel', path: 'DiffPanel', depth: 1, children: [] }
      ]
    }
    const dispositions = [{ region: 'BuildSpine', disposition: 'built-here', component: 'BuildSpine', verdict: 'NEW' }]

    expect(reconcileBrief(contract, dispositions)).toEqual({ ok: false, unaccounted: ['DiffPanel'] })
  })
})
