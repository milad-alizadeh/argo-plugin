import { describe, it, expect } from 'vitest'
import { lookupRegistry, parseCliArgs } from './registry-lookup.js'

const REGISTRY = {
  header: { generatedAt: '2026-07-08' },
  components: {
    Buttons: { nodeId: '73:3681', kind: 'kit', status: 'draft', adopted: true, notes: 'a very long note '.repeat(50), variantMatrix: [1, 2, 3] },
    SessionCard: { nodeId: '5015:1', kind: 'code-owned', status: 'audit-clean', adopted: false, notes: 'x', variantMatrix: [] },
    StatusBar: { nodeId: '5015:2', kind: 'code-owned', status: 'audit-clean', adopted: true, notes: 'y' },
    'D02.6 Chat': { nodeId: '5319:1712', kind: 'screen', status: 'audit-clean' },
    Broken: { kind: 'kit', status: 'draft' } // no nodeId
  }
}

describe('lookupRegistry', () => {
  it('returns a compact index of every component with a nodeId when no names/search given', () => {
    const out = lookupRegistry(REGISTRY, {})
    expect(out).toEqual([
      { name: 'Buttons', nodeId: '73:3681', kind: 'kit', status: 'draft', adopted: true },
      { name: 'SessionCard', nodeId: '5015:1', kind: 'code-owned', status: 'audit-clean', adopted: false },
      { name: 'StatusBar', nodeId: '5015:2', kind: 'code-owned', status: 'audit-clean', adopted: true },
      { name: 'D02.6 Chat', nodeId: '5319:1712', kind: 'screen', status: 'audit-clean' }
    ])
  })

  it('filters to one classification with --kind (e.g. --kind screen lists screens)', () => {
    expect(lookupRegistry(REGISTRY, { kind: 'screen' })).toEqual([
      { name: 'D02.6 Chat', nodeId: '5319:1712', kind: 'screen', status: 'audit-clean' }
    ])
    expect(lookupRegistry(REGISTRY, { kind: 'code-owned' }).map((e) => e.name)).toEqual(['SessionCard', 'StatusBar'])
  })

  it('composes --kind with --search', () => {
    expect(lookupRegistry(REGISTRY, { kind: 'code-owned', search: 'bar' }).map((e) => e.name)).toEqual(['StatusBar'])
  })

  it('strips the heavy notes/variantMatrix fields (the ~80% of the file that made a raw Read cost ~14k tokens)', () => {
    const out = lookupRegistry(REGISTRY, {})
    for (const entry of out) {
      expect(entry).not.toHaveProperty('notes')
      expect(entry).not.toHaveProperty('variantMatrix')
    }
  })

  it('skips entries with no nodeId (a name-only stub is not a resolvable component)', () => {
    expect(lookupRegistry(REGISTRY, {}).map((e) => e.name)).not.toContain('Broken')
  })

  it('filters to exact names when --names is given (order follows the request)', () => {
    expect(lookupRegistry(REGISTRY, { names: ['StatusBar', 'Buttons'] })).toEqual([
      { name: 'StatusBar', nodeId: '5015:2', kind: 'code-owned', status: 'audit-clean', adopted: true },
      { name: 'Buttons', nodeId: '73:3681', kind: 'kit', status: 'draft', adopted: true }
    ])
  })

  it('reports a requested name that is absent so a miss is explicit, not silent', () => {
    expect(lookupRegistry(REGISTRY, { names: ['Nope'] })).toEqual([{ name: 'Nope', missing: true }])
  })

  it('returns [] for an explicit empty names list (asking for nothing ≠ asking for everything)', () => {
    expect(lookupRegistry(REGISTRY, { names: [] })).toEqual([])
  })

  it('returns [] on a registry with no (or malformed) components key instead of throwing', () => {
    expect(lookupRegistry({}, {})).toEqual([])
    expect(lookupRegistry({ components: null }, {})).toEqual([])
    expect(lookupRegistry(undefined, {})).toEqual([])
  })

  it('substring-searches names case-insensitively with --search', () => {
    expect(lookupRegistry(REGISTRY, { search: 'card' }).map((e) => e.name)).toEqual(['SessionCard'])
  })
})

describe('parseCliArgs', () => {
  it('parses --names as a JSON array', () => {
    expect(parseCliArgs(['--names', '["Card"]'])).toMatchObject({ names: ['Card'] })
  })
  it('parses --search and --cwd', () => {
    expect(parseCliArgs(['--search', 'bar', '--cwd', '/repo'])).toMatchObject({ search: 'bar', cwd: '/repo' })
  })
  it('parses --kind', () => {
    expect(parseCliArgs(['--kind', 'screen'])).toMatchObject({ kind: 'screen' })
  })
  it('surfaces --help without throwing', () => {
    expect(parseCliArgs(['--help'])).toMatchObject({ help: true })
  })
  it('throws on an unrecognized flag rather than silently ignoring it', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(/unrecognized flag.*--bogus/)
  })
})
