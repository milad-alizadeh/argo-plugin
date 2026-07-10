import { describe, it, expect } from 'vitest'
import { findLiveComponent, buildRefreshedEntry, parseCliArgs } from './refresh-card.js'
import type { MarshaledComponent } from './pull-registry.js'

const liveSessionCard: MarshaledComponent = {
  name: 'SessionCard',
  nodeId: '5036:5786',
  pageName: 'Custom Components',
  pageIndex: 0,
  componentPropertyDefinitions: {
    state: { type: 'VARIANT', variantOptions: ['running', 'needs input', 'review', 'failed'] },
    slot: { type: 'VARIANT', variantOptions: ['progress', 'text', 'none'] }
  },
  annotations: [{ label: '@when-to-use: The session summary card used inside SessionRail. Reuse as-is.' }]
}

describe('findLiveComponent', () => {
  it('finds a live component by exact name', () => {
    const found = findLiveComponent([liveSessionCard], 'SessionCard')
    expect(found).toBe(liveSessionCard)
  })

  it('returns undefined when no live component matches', () => {
    expect(findLiveComponent([liveSessionCard], 'NoSuchThing')).toBeUndefined()
  })
})

describe('buildRefreshedEntry', () => {
  it('throws when there is no existing registry entry (refresh never creates)', () => {
    expect(() => buildRefreshedEntry({ liveComponent: liveSessionCard, existingEntry: undefined, now: '2026-07-10T00:00:00.000Z' })).toThrow(
      /no existing registry entry/
    )
  })

  it('refreshes variantMatrix, picks up a new whenToUse annotation, and re-stamps lastSyncedAt', () => {
    const existingEntry = {
      nodeId: '5036:5786',
      kind: 'custom',
      status: 'audit-clean',
      lastSyncedAt: '2026-07-08T12:17:37.000Z',
      notes: "renamed from pasted 'rail-session-card'; composes local Card...",
      variantMatrix: { state: ['running', 'needs input', 'review', 'failed', 'interrupted', 'finished', 'idle'], slot: ['progress', 'text', 'escalation', 'none'] }
    }
    const now = '2026-07-10T09:00:00.000Z'
    const refreshed = buildRefreshedEntry({ liveComponent: liveSessionCard, existingEntry, now })

    expect(refreshed.variantMatrix).toEqual({
      state: ['running', 'needs input', 'review', 'failed'],
      slot: ['progress', 'text', 'none']
    })
    expect(refreshed.whenToUse).toBe('The session summary card used inside SessionRail. Reuse as-is.')
    expect(refreshed.lastSyncedAt).toBe(now)
    expect(refreshed.nodeId).toBe('5036:5786')
    // untouched fields preserved
    expect(refreshed.kind).toBe('custom')
    expect(refreshed.status).toBe('audit-clean')
  })

  it('updates the notes field from the live description when the entry already carries notes', () => {
    const existingEntry = { nodeId: '1:1', kind: 'custom', status: 'audit-clean', lastSyncedAt: 'old', notes: 'stale notes', variantMatrix: {} }
    const live: MarshaledComponent = { name: 'Thing', nodeId: '1:1', pageName: 'Custom Components', pageIndex: 0, description: 'fresh live description' }
    const refreshed = buildRefreshedEntry({ liveComponent: live, existingEntry, now: '2026-07-10T00:00:00.000Z' })
    expect(refreshed.notes).toBe('fresh live description')
    expect(refreshed.description).toBeUndefined()
  })

  it('updates the description field (not notes) when the entry carries description instead', () => {
    const existingEntry = { nodeId: '1:1', kind: 'kit', status: 'audit-clean', lastSyncedAt: 'old', description: 'stale description', variantMatrix: {} }
    const live: MarshaledComponent = { name: 'Thing', nodeId: '1:1', pageName: 'Buttons', pageIndex: 2, description: 'fresh live description' }
    const refreshed = buildRefreshedEntry({ liveComponent: live, existingEntry, now: '2026-07-10T00:00:00.000Z' })
    expect(refreshed.description).toBe('fresh live description')
    expect(refreshed.notes).toBeUndefined()
  })

  it('leaves notes/description untouched when the live component has no description', () => {
    const existingEntry = { nodeId: '1:1', kind: 'custom', status: 'audit-clean', lastSyncedAt: 'old', notes: 'kept as-is', variantMatrix: {} }
    const live: MarshaledComponent = { name: 'Thing', nodeId: '1:1', pageName: 'Custom Components', pageIndex: 0 }
    const refreshed = buildRefreshedEntry({ liveComponent: live, existingEntry, now: '2026-07-10T00:00:00.000Z' })
    expect(refreshed.notes).toBe('kept as-is')
  })

  it('heals a moved nodeId', () => {
    const existingEntry = { nodeId: 'old-id', kind: 'custom', status: 'audit-clean', lastSyncedAt: 'old', variantMatrix: {} }
    const live: MarshaledComponent = { name: 'Thing', nodeId: 'new-id', pageName: 'Custom Components', pageIndex: 0 }
    const refreshed = buildRefreshedEntry({ liveComponent: live, existingEntry, now: '2026-07-10T00:00:00.000Z' })
    expect(refreshed.nodeId).toBe('new-id')
  })
})

describe('parseCliArgs', () => {
  it('parses --component', () => {
    expect(parseCliArgs(['--component', 'SessionCard'])).toEqual({ component: 'SessionCard' })
  })

  it('recognizes --help', () => {
    expect(parseCliArgs(['--help'])).toEqual({ help: true })
  })

  it('rejects unknown flags', () => {
    expect(() => parseCliArgs(['--bogus', 'x'])).toThrow(/unrecognized flag/)
  })
})
