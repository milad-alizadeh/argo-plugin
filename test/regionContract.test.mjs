import { describe, it, expect } from 'vitest'
import {
  classifyCoverage,
  summarize,
  reconcileBrief,
  buildRegionContract,
  buildBuiltRegions,
  screenMatchesReceipt,
  evaluateCoverageReceipt,
  coverageReceiptFilename,
  deriveExpectedScreensFromStagedFiles
} from '../packages/figma-design-kit/region-contract.js'
import d01Contract from './fixtures/d01-wireframe-contract.json' with { type: 'json' }
import d01ShippedShell from './fixtures/d01-shipped-shell-built.json' with { type: 'json' }

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

  it('exempts layout regions from the instance requirement — a matched container is present without isInstance', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [
        { name: 'Stage', path: 'Stage', depth: 1, kind: 'layout', children: [] },
        { name: 'TerminalPanel', path: 'TerminalPanel', depth: 2, children: [] }
      ]
    }
    const builtRegions = [
      { name: 'Stage', path: 'Stage', isInstance: false },
      { name: 'TerminalPanel', path: 'TerminalPanel', isInstance: true, instanceOf: 'TerminalPanel' }
    ]
    const dispositions = [
      { region: 'Stage', disposition: 'built-here', component: '(layout)', verdict: 'REUSE' },
      { region: 'TerminalPanel', disposition: 'built-here', component: 'TerminalPanel', verdict: 'RECONCILE' }
    ]

    const classification = classifyCoverage(contract, builtRegions, dispositions)

    expect(classification).toEqual([
      { name: 'Stage', path: 'Stage', status: 'present' },
      { name: 'TerminalPanel', path: 'TerminalPanel', status: 'present' }
    ])
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

describe('buildRegionContract (P1 extract: wraps flattenToRegions with the screen/wireframeNodeId/figmaFileVersion envelope)', () => {
  it('wraps flattenToRegions output with the contract envelope fields', () => {
    const tree = { name: 'BuildSpine', type: 'INSTANCE', children: [] }

    const contract = buildRegionContract(tree, { screen: 'cockpit-shell', wireframeNodeId: '26:3', figmaFileVersion: '42' })

    expect(contract).toEqual({
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'BuildSpine', path: 'BuildSpine', depth: 0, children: [] }]
    })
  })
})

describe('buildBuiltRegions (C1: same promotion rule applied to a BUILT-screen metadata dump)', () => {
  it('emits isInstance + instanceOf for a promoted instance node', () => {
    const tree = { name: 'BuildSpine', type: 'INSTANCE', componentName: 'BuildSpine', children: [] }

    expect(buildBuiltRegions(tree)).toEqual([{ name: 'BuildSpine', path: 'BuildSpine', isInstance: true, instanceOf: 'BuildSpine' }])
  })
})

describe('screenMatchesReceipt (C2: screen cross-check the coverage gate uses to reject a stale other-screen receipt)', () => {
  it('rejects a receipt whose screen does not match the screen being committed', () => {
    expect(screenMatchesReceipt({ screen: 'other-screen' }, 'cockpit-shell')).toBe(false)
  })
})

describe('evaluateCoverageReceipt (moved here from hooks/design-coverage-gate.mjs so C2 wiring edits land in a reliably-editable module)', () => {
  it('rejects a receipt whose screen does not match the screen being committed', () => {
    const receipt = { screen: 'other-screen', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { expectedScreen: 'cockpit-shell', contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })
})

describe('coverageReceiptFilename (C2: screen-scope the receipt path, moved here alongside evaluateCoverageReceipt)', () => {
  it('names the receipt file after the screen, not a fixed coverage-receipt.json', () => {
    expect(coverageReceiptFilename('cockpit-shell')).toBe('coverage-receipt-cockpit-shell.json')
  })
})

describe('deriveExpectedScreensFromStagedFiles (C2: which screen(s) a commit touches, from its staged design/** artifacts)', () => {
  it('derives the screen name from a staged per-screen coverage-receipt path', () => {
    const stagedFiles = ['design/coverage-receipt-cockpit-shell.json', 'src/renderer/src/components/BuildSpine.tsx']

    expect(deriveExpectedScreensFromStagedFiles(stagedFiles)).toEqual(['cockpit-shell'])
  })
})

describe('D01 regression (the gate this mechanism exists to catch)', () => {
  it('flags UNACCOUNTED>=3 and clean:false for the shipped-shell built tree that dropped D01\'s richer wireframe regions', () => {
    const classification = classifyCoverage(d01Contract, d01ShippedShell.builtRegions, [])
    const summary = summarize(classification)

    expect(summary.UNACCOUNTED.length).toBeGreaterThanOrEqual(3)
    expect(summary.UNACCOUNTED).toEqual(expect.arrayContaining(['BuildSpine', 'DiffPanel', 'LensBar', 'VoiceSwitch']))
    expect(summary.clean).toBe(false)
  })

  it('is clean when the built tree covers every D01 contract region as a registry-backed instance', () => {
    const fullBuiltRegions = d01Contract.regions.map((region) => ({
      name: region.name,
      path: region.path,
      isInstance: true,
      instanceOf: region.name
    }))

    const classification = classifyCoverage(d01Contract, fullBuiltRegions, [])
    const summary = summarize(classification)

    expect(summary.clean).toBe(true)
    expect(summary.UNACCOUNTED).toEqual([])
    expect(summary.MISSING).toEqual([])
  })
})
