import { describe, it, expect } from 'vitest'
import { resolveInstancePresence, summarizeInstancePresence, type BuiltInstance, type RegistryLookupEntry } from './instance-presence.js'

describe('resolveInstancePresence', () => {
  const registry: RegistryLookupEntry[] = [
    { nodeId: '1:1', name: 'stage-orb-scene' },
    { nodeId: '1:2', name: 'topbar' }
  ]

  it('resolves an INSTANCE by nodeId against the registry', () => {
    const built: BuiltInstance[] = [{ nodeId: '1:1', name: 'stage-orb-scene', type: 'INSTANCE' }]
    const results = resolveInstancePresence(built, registry)
    expect(results).toEqual([{ nodeId: '1:1', name: 'stage-orb-scene', status: 'resolved' }])
  })

  it('falls back to a normalized name match when the nodeId misses', () => {
    // instance node has a stale/unknown nodeId but a name that normalizes to a registry entry
    const built: BuiltInstance[] = [{ nodeId: '9:9', name: 'Top Bar', type: 'INSTANCE' }]
    const results = resolveInstancePresence(built, registry)
    expect(results[0].status).toBe('resolved')
  })

  it('marks an instance with no nodeId or name match unresolved', () => {
    const built: BuiltInstance[] = [{ nodeId: '9:9', name: 'made-up-widget', type: 'INSTANCE' }]
    const results = resolveInstancePresence(built, registry)
    expect(results[0].status).toBe('unresolved')
  })

  it('ignores non-INSTANCE nodes entirely', () => {
    const built: BuiltInstance[] = [{ nodeId: '5:5', name: 'stage-orb-scene', type: 'FRAME' }]
    expect(resolveInstancePresence(built, registry)).toEqual([])
  })
})

describe('summarizeInstancePresence', () => {
  it('is clean when every instance resolved', () => {
    const results = resolveInstancePresence(
      [{ nodeId: '1:1', name: 'stage-orb-scene', type: 'INSTANCE' }],
      [{ nodeId: '1:1', name: 'stage-orb-scene' }]
    )
    const summary = summarizeInstancePresence(results)
    expect(summary.clean).toBe(true)
    expect(summary.resolved).toEqual(['stage-orb-scene'])
    expect(summary.unresolved).toEqual([])
  })

  it('is not clean when any instance is unresolved', () => {
    const results = resolveInstancePresence(
      [{ nodeId: '9:9', name: 'made-up-widget', type: 'INSTANCE' }],
      [{ nodeId: '1:1', name: 'stage-orb-scene' }]
    )
    const summary = summarizeInstancePresence(results)
    expect(summary.clean).toBe(false)
    expect(summary.unresolved).toEqual(['made-up-widget'])
  })
})
