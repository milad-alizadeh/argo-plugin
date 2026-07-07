import { describe, it, expect } from 'vitest'
import { classifyStaleness, diffVariableDefs, classifyNodeDrift } from './staleness.js'

describe('classifyStaleness', () => {
  it('returns in-sync when nothing changed', () => {
    expect(
      classifyStaleness({
        fileVersionChanged: false,
        variableDrift: { changed: [] },
        nodeDrift: { orphaned: [] },
        variantShapeChanged: false
      })
    ).toBe('in-sync')
  })

  it('returns presentation-drift when only variables changed', () => {
    expect(
      classifyStaleness({
        fileVersionChanged: true,
        variableDrift: { changed: ['color/accent'] },
        nodeDrift: { orphaned: [] },
        variantShapeChanged: false
      })
    ).toBe('presentation-drift')
  })

  it('returns orphaned when a registry entry has no live node', () => {
    expect(
      classifyStaleness({
        fileVersionChanged: true,
        variableDrift: { changed: [] },
        nodeDrift: { orphaned: ['123:456'] },
        variantShapeChanged: false
      })
    ).toBe('orphaned')
  })

  it('returns api-drift when the variant shape changed', () => {
    expect(
      classifyStaleness({
        fileVersionChanged: true,
        variableDrift: { changed: [] },
        nodeDrift: { orphaned: [] },
        variantShapeChanged: true
      })
    ).toBe('api-drift')
  })

  it('prioritizes orphaned over api-drift when both are present', () => {
    expect(
      classifyStaleness({
        fileVersionChanged: true,
        variableDrift: { changed: [] },
        nodeDrift: { orphaned: ['123:456'] },
        variantShapeChanged: true
      })
    ).toBe('orphaned')
  })
})

describe('diffVariableDefs', () => {
  it('reports no changed keys when snapshots are identical', () => {
    expect(diffVariableDefs({ a: 1 }, { a: 1 })).toEqual({ changed: [] })
  })

  it('reports keys whose value changed', () => {
    expect(diffVariableDefs({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ changed: ['b'] })
  })

  it('reports keys added or removed between snapshots', () => {
    expect(diffVariableDefs({ a: 1 }, { a: 1, c: 4 })).toEqual({ changed: ['c'] })
    expect(diffVariableDefs({ a: 1, b: 2 }, { a: 1 })).toEqual({ changed: ['b'] })
  })
})

describe('classifyNodeDrift', () => {
  it('reports no orphans when every registry nodeId is live', () => {
    expect(
      classifyNodeDrift({
        registryEntries: [{ nodeId: '1:1' }, { nodeId: '1:2' }],
        liveNodeIds: ['1:1', '1:2', '1:3']
      })
    ).toEqual({ orphaned: [] })
  })

  it('reports registry entries whose nodeId is no longer live', () => {
    expect(
      classifyNodeDrift({
        registryEntries: [{ nodeId: '1:1' }, { nodeId: '1:2' }],
        liveNodeIds: ['1:1']
      })
    ).toEqual({ orphaned: ['1:2'] })
  })
})
