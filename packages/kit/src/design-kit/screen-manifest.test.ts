import { describe, it, expect } from 'vitest'
import {
  parseScreenManifest,
  classifyInstancePresence,
  summarizeInstancePresence,
  type BuiltNode
} from './screen-manifest.js'

describe('parseScreenManifest', () => {
  it('extracts the argo-screen fenced block from surrounding annotation prose', () => {
    const text = [
      'First-run cold-open. Orb hero, empty rail.',
      '',
      '```argo-screen',
      'stage-orb-scene',
      'first-run-cta',
      'rail-session-card x0',
      'topbar',
      '```'
    ].join('\n')
    expect(parseScreenManifest(text)).toEqual([
      { name: 'stage-orb-scene' },
      { name: 'first-run-cta' },
      { name: 'rail-session-card', count: 0 },
      { name: 'topbar' }
    ])
  })

  it('skips blank and comment lines and reads xN cardinality anywhere on the line', () => {
    const text = '```argo-screen\n# the list\nrail-session-card x3\n\nstatus-bar\n```'
    expect(parseScreenManifest(text)).toEqual([{ name: 'rail-session-card', count: 3 }, { name: 'status-bar' }])
  })

  it('returns [] when there is no block, empty input, or null (un-annotated screen)', () => {
    expect(parseScreenManifest('just some notes, no block')).toEqual([])
    expect(parseScreenManifest('')).toEqual([])
    expect(parseScreenManifest(null)).toEqual([])
  })
})

describe('classifyInstancePresence', () => {
  const registry = ['rail-session-card', 'stage-orb-scene', 'first-run-cta', 'topbar']

  it('marks a populated instance present and a same-named traced frame HOLLOW', () => {
    const built: BuiltNode[] = [
      { name: 'stage-orb-scene', type: 'INSTANCE', componentName: 'stage-orb-scene', childCount: 3 },
      { name: 'first-run-cta', type: 'FRAME', childCount: 2 } // traced, not an instance
    ]
    const results = classifyInstancePresence(
      [{ name: 'stage-orb-scene' }, { name: 'first-run-cta' }],
      built,
      registry
    )
    expect(results.find((r) => r.name === 'stage-orb-scene')?.status).toBe('present')
    expect(results.find((r) => r.name === 'first-run-cta')?.status).toBe('HOLLOW')
  })

  it('marks a declared component with no node at all MISSING', () => {
    const results = classifyInstancePresence([{ name: 'topbar' }], [], registry)
    expect(results[0].status).toBe('MISSING')
  })

  it('treats an empty INSTANCE (no children) as HOLLOW, not present', () => {
    const built: BuiltNode[] = [{ name: 'topbar', type: 'INSTANCE', componentName: 'topbar', childCount: 0 }]
    expect(classifyInstancePresence([{ name: 'topbar' }], built, registry)[0].status).toBe('HOLLOW')
  })

  it('flags a declared name absent from the registry as UNREGISTERED', () => {
    const results = classifyInstancePresence([{ name: 'made-up-widget' }], [], registry)
    expect(results[0].status).toBe('UNREGISTERED')
  })

  it('does NOT flag UNREGISTERED when the registry is empty (fails open)', () => {
    const results = classifyInstancePresence([{ name: 'anything' }], [], [])
    expect(results[0].status).toBe('MISSING')
  })

  it('skips an x0 declared-absent entry and warns only if instances unexpectedly exist', () => {
    const absent = classifyInstancePresence([{ name: 'rail-session-card', count: 0 }], [], registry)
    expect(absent[0].status).toBe('skipped')
    expect(absent[0].warning).toBeUndefined()

    const built: BuiltNode[] = [
      { name: 'rail-session-card', type: 'INSTANCE', componentName: 'rail-session-card', childCount: 4 }
    ]
    const present = classifyInstancePresence([{ name: 'rail-session-card', count: 0 }], built, registry)
    expect(present[0].status).toBe('skipped')
    expect(present[0].warning).toMatch(/declared x0/)
  })

  it('keeps a cardinality shortfall present with an advisory warning (presence-only)', () => {
    const built: BuiltNode[] = [
      { name: 'rail-session-card', type: 'INSTANCE', componentName: 'rail-session-card', childCount: 2 },
      { name: 'rail-session-card', type: 'INSTANCE', componentName: 'rail-session-card', childCount: 2 }
    ]
    const results = classifyInstancePresence([{ name: 'rail-session-card', count: 3 }], built, registry)
    expect(results[0].status).toBe('present')
    expect(results[0].warning).toMatch(/2 built, expected 3/)
  })

  it('matches instances by resolved componentName, tolerant of naming variants', () => {
    // instance node named "Rail Session Card" but resolving to registry key rail-session-card
    const built: BuiltNode[] = [
      { name: 'Rail Session Card', type: 'INSTANCE', componentName: 'Rail_Session_Card', childCount: 5 }
    ]
    const results = classifyInstancePresence([{ name: 'rail-session-card' }], built, registry)
    expect(results[0].status).toBe('present')
  })
})

describe('summarizeInstancePresence', () => {
  it('is clean only when nothing is MISSING/HOLLOW/UNREGISTERED; cardinality warnings do not dirty it', () => {
    const results = classifyInstancePresence(
      [{ name: 'stage-orb-scene' }, { name: 'rail-session-card', count: 3 }, { name: 'topbar', count: 0 }],
      [
        { name: 'stage-orb-scene', type: 'INSTANCE', componentName: 'stage-orb-scene', childCount: 2 },
        { name: 'rail-session-card', type: 'INSTANCE', componentName: 'rail-session-card', childCount: 2 }
      ],
      ['stage-orb-scene', 'rail-session-card', 'topbar']
    )
    const summary = summarizeInstancePresence(results)
    expect(summary.clean).toBe(true)
    expect(summary.warnings).toHaveLength(1) // rail cardinality 2<3
    expect(summary.skipped).toContain('topbar')
  })

  it('is not clean when a component is MISSING', () => {
    const results = classifyInstancePresence([{ name: 'topbar' }], [], ['topbar'])
    expect(summarizeInstancePresence(results).clean).toBe(false)
  })
})
