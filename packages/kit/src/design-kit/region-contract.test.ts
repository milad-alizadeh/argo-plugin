import { describe, it, expect } from 'vitest'
import {
  classifyCoverage,
  classifyCoverageByComponent,
  summarize,
  reconcileBrief,
  buildRegionContract,
  buildBuiltRegions,
  screenMatchesReceipt,
  evaluateCoverageReceipt,
  coverageReceiptFilename,
  deriveExpectedScreensFromStagedFiles,
  lintContractFreeze
} from './region-contract.js'
import d01Contract from '../../../../test/fixtures/d01-wireframe-contract.json' with { type: 'json' }
import d01ShippedShell from '../../../../test/fixtures/d01-shipped-shell-built.json' with { type: 'json' }

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

describe('classifyCoverage (C3a: path-aware matching — a repeated name under different parents cannot be satisfied by one shared instance)', () => {
  it('does not let a single built instance under PanelA satisfy the same-named region under PanelB', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [
        { name: 'PanelHead', path: 'Stage/PanelA/PanelHead', depth: 3, children: [] },
        { name: 'PanelHead', path: 'Stage/PanelB/PanelHead', depth: 3, children: [] }
      ]
    }
    // Only PanelA's PanelHead was actually built — PanelB's is a name-only
    // collision with the built tree, which findBuiltMatch must not conflate.
    const builtRegions = [{ name: 'PanelHead', path: 'Stage/PanelA/PanelHead', isInstance: true, instanceOf: 'PanelHead' }]

    const classification = classifyCoverage(contract, builtRegions, [])

    expect(classification).toEqual([
      { name: 'PanelHead', path: 'Stage/PanelA/PanelHead', status: 'present' },
      { name: 'PanelHead', path: 'Stage/PanelB/PanelHead', status: 'UNACCOUNTED' }
    ])
  })
})

describe('classifyCoverage (C3b: cardinality + declared children are WARN, not a hard fail — a hollow instance still scores present)', () => {
  it('warns when a declared child is absent from the built tree (hollow instance)', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'ProfileCard', path: 'ProfileCard', depth: 1, children: ['Avatar', 'Name'] }]
    }
    // ProfileCard itself was built as an instance, but neither declared
    // child (Avatar, Name) was actually placed inside it — a hollow card.
    const builtRegions = [{ name: 'ProfileCard', path: 'ProfileCard', isInstance: true, instanceOf: 'ProfileCard' }]

    const classification = classifyCoverage(contract, builtRegions, [])

    expect(classification).toEqual([
      {
        name: 'ProfileCard',
        path: 'ProfileCard',
        status: 'present',
        warning: 'hollow instance — declared child(ren) not built: Avatar, Name'
      }
    ])
  })

  it('warns when the built count under a region is below its declared cardinality', () => {
    const contract = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '1',
      regions: [{ name: 'FindingsList', path: 'FindingsList', depth: 1, cardinality: 3, children: [] }]
    }
    const builtRegions = [
      { name: 'FindingsList', path: 'FindingsList', isInstance: true, instanceOf: 'FindingsList' },
      { name: 'FindingCard', path: 'FindingsList/FindingCard-1', isInstance: true, instanceOf: 'FindingCard' },
      { name: 'FindingCard', path: 'FindingsList/FindingCard-2', isInstance: true, instanceOf: 'FindingCard' }
    ]

    const classification = classifyCoverage(contract, builtRegions, [])

    expect(classification).toEqual([
      { name: 'FindingsList', path: 'FindingsList', status: 'present', warning: 'cardinality 2 built, expected 3' }
    ])
  })
})

describe('classifyCoverageByComponent (build-screen option B: code screens match by disposition component, not Figma path)', () => {
  const contract = {
    screen: 'Shell',
    regions: [
      { name: 'TitleBlock', path: 'Shell/TitleBlock', depth: 1, children: [] },
      { name: 'StatusBar', path: 'Shell/StatusBar', depth: 1, children: [] },
      { name: 'VoiceSwitch', path: 'Shell/VoiceSwitch', depth: 1, children: [] }
    ]
  }

  it('present when the disposition component rendered, MISSING when it did not, deferred for a deferred-to row', () => {
    const dispositions = [
      { region: 'TitleBlock', disposition: 'built-here', component: 'title-block', verdict: 'NEW' },
      { region: 'StatusBar', disposition: 'built-here', component: 'status-bar', verdict: 'REUSE' },
      { region: 'VoiceSwitch', disposition: 'deferred-to-wave-2', target: 'wave-2', reason: 'not yet designed' }
    ]
    const rendered = [{ component: 'title-block', path: 'Shell/header/title-block' }]

    expect(classifyCoverageByComponent(contract, rendered, dispositions)).toEqual([
      { name: 'TitleBlock', path: 'Shell/TitleBlock', status: 'present' },
      { name: 'StatusBar', path: 'Shell/StatusBar', status: 'MISSING' },
      { name: 'VoiceSwitch', path: 'Shell/VoiceSwitch', status: 'deferred' }
    ])
  })

  it('flags a rendered component that no built-here disposition names as UNACCOUNTED (built something unplanned)', () => {
    const dispositions = [
      { region: 'TitleBlock', disposition: 'built-here', component: 'title-block', verdict: 'NEW' },
      { region: 'StatusBar', disposition: 'built-here', component: 'status-bar', verdict: 'REUSE' },
      { region: 'VoiceSwitch', disposition: 'deferred-to-wave-2', target: 'wave-2', reason: 'x' }
    ]
    const rendered = [
      { component: 'title-block' },
      { component: 'status-bar' },
      { component: 'rogue-widget', path: 'Shell/rogue-widget' }
    ]

    const result = classifyCoverageByComponent(contract, rendered, dispositions)
    expect(result).toContainEqual({ name: 'rogue-widget', path: 'Shell/rogue-widget', status: 'UNACCOUNTED' })
    expect(summarize(result).clean).toBe(false)
  })

  it('consumes instances: two distinct regions mapped to the same component need two rendered instances', () => {
    const twoCards = {
      screen: 'Roster',
      regions: [
        { name: 'CardA', path: 'Roster/CardA', depth: 1, children: [] },
        { name: 'CardB', path: 'Roster/CardB', depth: 1, children: [] }
      ]
    }
    const dispositions = [
      { region: 'CardA', disposition: 'built-here', component: 'session-card', verdict: 'REUSE' },
      { region: 'CardB', disposition: 'built-here', component: 'session-card', verdict: 'REUSE' }
    ]
    const rendered = [{ component: 'session-card' }] // only one built

    expect(classifyCoverageByComponent(twoCards, rendered, dispositions)).toEqual([
      { name: 'CardA', path: 'Roster/CardA', status: 'present' },
      { name: 'CardB', path: 'Roster/CardB', status: 'MISSING' }
    ])
  })

  it('WARNs (never fails clean) when a cardinality region has fewer instances than declared', () => {
    const list = { screen: 'Audit', regions: [{ name: 'FindingsList', path: 'Audit/FindingsList', depth: 1, children: [] }] }
    const dispositions = [{ region: 'FindingsList', disposition: 'built-here', component: 'finding-row', verdict: 'NEW', cardinality: 3 }]
    const rendered = [{ component: 'finding-row' }, { component: 'finding-row' }]

    const result = classifyCoverageByComponent(list, rendered, dispositions)
    expect(result).toEqual([
      { name: 'FindingsList', path: 'Audit/FindingsList', status: 'present', warning: 'cardinality 2 built, expected 3' }
    ])
    // extras/shortfall of a PLANNED component never make it UNACCOUNTED, and a
    // cardinality shortfall is advisory only
    expect(summarize(result).clean).toBe(true)
  })

  it('fail-closed MISSING for a built-here row with no component field (malformed row cannot be verified)', () => {
    const one = { screen: 'X', regions: [{ name: 'Widget', path: 'X/Widget', depth: 1, children: [] }] }
    const dispositions = [{ region: 'Widget', disposition: 'built-here', verdict: 'NEW' }] // no component
    expect(classifyCoverageByComponent(one, [{ component: 'anything' }], dispositions)).toEqual([
      { name: 'Widget', path: 'X/Widget', status: 'MISSING' },
      { name: 'anything', path: 'anything', status: 'UNACCOUNTED' }
    ])
  })

  it('flags a component named only in a deferred row but rendered anyway as UNACCOUNTED (building a deferred thing is a surprise)', () => {
    const one = { screen: 'X', regions: [{ name: 'Later', path: 'X/Later', depth: 1, children: [] }] }
    const dispositions = [{ region: 'Later', disposition: 'deferred-to-wave-2', component: 'future-thing', target: 'wave-2', reason: 'x' }]
    const result = classifyCoverageByComponent(one, [{ component: 'future-thing' }], dispositions)
    expect(result).toEqual([
      { name: 'Later', path: 'X/Later', status: 'deferred' },
      { name: 'future-thing', path: 'future-thing', status: 'UNACCOUNTED' }
    ])
  })

  it('a cardinality region and a plain region on the same component each consume an instance (interaction)', () => {
    const screen = {
      screen: 'Feed',
      regions: [
        { name: 'Cards', path: 'Feed/Cards', depth: 1, children: [] },
        { name: 'Hero', path: 'Feed/Hero', depth: 1, children: [] }
      ]
    }
    const dispositions = [
      { region: 'Cards', disposition: 'built-here', component: 'card', verdict: 'NEW', cardinality: 2 },
      { region: 'Hero', disposition: 'built-here', component: 'card', verdict: 'REUSE' }
    ]
    const rendered = [{ component: 'card' }, { component: 'card' }, { component: 'card' }] // 3 built: 2 for Cards' cardinality + 1 for Hero

    const result = classifyCoverageByComponent(screen, rendered, dispositions)
    expect(result).toEqual([
      { name: 'Cards', path: 'Feed/Cards', status: 'present' }, // 3 >= cardinality 2, no warning
      { name: 'Hero', path: 'Feed/Hero', status: 'present' }
    ])
    expect(summarize(result).clean).toBe(true)
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
      warnings: [],
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
      warnings: [],
      clean: false
    })
  })

  it('surfaces C3b warnings (hollow instance / cardinality) without changing clean semantics', () => {
    const classification = [
      { name: 'BuildSpine', path: 'BuildSpine', status: 'present' },
      { name: 'ProfileCard', path: 'ProfileCard', status: 'present', warning: 'hollow instance — declared child(ren) not built: Avatar' }
    ]

    expect(summarize(classification)).toEqual({
      present: ['BuildSpine', 'ProfileCard'],
      deferred: [],
      UNACCOUNTED: [],
      MISSING: [],
      warnings: [{ name: 'ProfileCard', path: 'ProfileCard', warning: 'hollow instance — declared child(ren) not built: Avatar' }],
      clean: true
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

describe('lintContractFreeze (C3c: P1 freeze lint — a contract commit may not drift without a figmaFileVersion bump)', () => {
  it('rejects a region-set drift when figmaFileVersion is unchanged', () => {
    const previous = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'Stage', path: 'Stage', depth: 0, kind: 'layout', children: [] }]
    }
    const next = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'Stage', path: 'Stage', depth: 0, children: [] }]
    }

    expect(lintContractFreeze(previous, next).ok).toBe(false)
  })

  it('allows the same drift when figmaFileVersion is bumped alongside it', () => {
    const previous = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '42',
      regions: [{ name: 'Stage', path: 'Stage', depth: 0, kind: 'layout', children: [] }]
    }
    const next = {
      screen: 'cockpit-shell',
      wireframeNodeId: '26:3',
      figmaFileVersion: '43',
      regions: [{ name: 'Stage', path: 'Stage', depth: 0, children: [] }]
    }

    expect(lintContractFreeze(previous, next).ok).toBe(true)
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
