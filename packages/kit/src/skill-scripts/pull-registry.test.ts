import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { marshalRestDocument, marshalScreenFrames, buildPullRegistryResult, token } from './pull-registry.js'
import fixture from '../../../../test/fixtures/figma-file-response.json' with { type: 'json' }

describe('marshalRestDocument', () => {
  it('flattens every COMPONENT/COMPONENT_SET across pages, including ones nested inside a SECTION', () => {
    const components = marshalRestDocument(fixture as any)
    expect(components).toEqual(
      expect.arrayContaining([
        {
          name: 'SessionCard',
          nodeId: '1:2',
          pageName: 'Custom Components',
          pageIndex: 0,
          componentPropertyDefinitions: {},
          description: 'Session summary card used in the dashboard list.'
        },
        {
          name: 'Buttons',
          nodeId: '2:2',
          pageName: 'Buttons',
          pageIndex: 2,
          componentPropertyDefinitions: {
            size: { type: 'VARIANT', variantOptions: ['sm', 'md', 'lg'] },
            disabled: { type: 'BOOLEAN' }
          },
          description: 'Primary/secondary/ghost button variants.'
        },
        { name: 'lucide/arrow-right', nodeId: '2:3', pageName: 'Buttons', pageIndex: 2, componentPropertyDefinitions: undefined },
        {
          name: 'Dialog',
          nodeId: '3:3',
          pageName: 'Overlays',
          pageIndex: 3,
          componentPropertyDefinitions: { size: { type: 'VARIANT', variantOptions: ['sm', 'md'] } }
        },
        { name: 'Throwaway', nodeId: '4:2', pageName: 'Scratch - wip', pageIndex: 5, componentPropertyDefinitions: undefined }
      ])
    )
  })

  it('excludes non-component nodes (a plain FRAME on Custom Components)', () => {
    const components = marshalRestDocument(fixture as any)
    expect(components.some((c) => c.name === 'Not A Component Frame')).toBe(false)
  })

  it('returns every real component across all pages (divider pages carry none)', () => {
    const components = marshalRestDocument(fixture as any)
    // 9 components: SessionCard, Buttons, lucide/arrow-right, Dialog, Calendar (kit),
    // Throwaway, DemoDashboard, CalendarDemo, arrow-up. Marshaling keeps ALL of them;
    // the kit/custom split happens later in buildPullRegistryResult.
    expect(components).toHaveLength(9)
  })
})

describe('buildPullRegistryResult', () => {
  it('classifies kit vs custom by divider band (positional, collision-proof) and upserts only newly-seen kit components', () => {
    const liveComponents = marshalRestDocument(fixture as any)
    const orderedPageNames = (fixture as any).document.children.map((p: any) => p.name)
    const result = buildPullRegistryResult({
      liveComponents,
      orderedPageNames,
      registry: { components: {} },
      now: '2026-07-07T00:00:00.000Z'
    })
    // Non-kit: SessionCard (Custom Components, before the band), Throwaway (in-band Scratch,
    // safety-filtered), DemoDashboard (Examples demo), CalendarDemo (a demo page named "Calendar"
    // that collides by name with the kit Calendar but sits at a different page index), arrow-up
    // (Lucide Icons page, after the band).
    expect(result.customComponentCount).toBe(5)
    // Kit band (between '------' and the next '---'): Buttons page (Buttons + lucide/arrow-right),
    // Overlays (Dialog, nested inside a SECTION), Calendar (Calendar).
    expect(result.kitComponentCount).toBe(4)
    // lucide/-prefixed names are dropped by buildKitRegistryEntries.
    expect(Object.keys(result.newEntries).sort()).toEqual(['Buttons', 'Calendar', 'Dialog'])
    expect(result.newEntries.Buttons.kind).toBe('kit')
    expect(result.newEntries.Buttons.description).toBe('Primary/secondary/ghost button variants.')
    // Collision proof: the kit-band Calendar is registered with its description; the demo Calendar is not.
    expect(result.newEntries.Calendar.description).toBe('Date picker calendar grid.')
  })

  it('derives a code-owned entry from the @code-owned marker regardless of page band', () => {
    const liveComponents = [
      { name: 'SceneWallpaper', nodeId: '5091:7366', pageName: 'Custom Components', pageIndex: 0, description: 'Backdrop. @code-owned: src/scene/SceneWallpaper.tsx' }
    ]
    const result = buildPullRegistryResult({
      liveComponents,
      orderedPageNames: ['Custom Components'],
      registry: { components: {} },
      now: '2026-07-08T00:00:00.000Z'
    })
    expect(result.codeOwnedComponentCount).toBe(1)
    expect(result.customComponentCount).toBe(0) // not double-counted as custom
    expect(result.codeOwnedEntries.SceneWallpaper).toMatchObject({ kind: 'code-owned', codePath: 'src/scene/SceneWallpaper.tsx' })
  })

  it('leaves an already-registered kit component untouched', () => {
    const liveComponents = marshalRestDocument(fixture as any)
    const orderedPageNames = (fixture as any).document.children.map((p: any) => p.name)
    const result = buildPullRegistryResult({
      liveComponents,
      orderedPageNames,
      registry: { components: { Buttons: { nodeId: '2:2', kind: 'kit', status: 'audit-clean', lastSyncedAt: null, variantMatrix: {} } } },
      now: '2026-07-07T00:00:00.000Z'
    })
    expect(Object.keys(result.newEntries).sort()).toEqual(['Calendar', 'Dialog'])
  })
})

describe('marshalScreenFrames', () => {
  it('collects only top-level frames carrying an @screen annotation', () => {
    const frames = marshalScreenFrames(fixture as any)
    expect(frames).toEqual([{ name: 'D02.6 Chat', nodeId: '10:2', annotations: [{ label: '@screen' }] }])
  })

  it('ignores unmarked frames and the unrelated Custom Components frame', () => {
    const frames = marshalScreenFrames(fixture as any)
    expect(frames.some((f) => f.name === 'Unmarked Frame')).toBe(false)
    expect(frames.some((f) => f.name === 'Not A Component Frame')).toBe(false)
  })
})

describe('buildPullRegistryResult — screens', () => {
  it('mirrors a live @screen annotation into a new kind:"screen" entry', () => {
    const result = buildPullRegistryResult({
      liveComponents: [],
      liveScreenFrames: marshalScreenFrames(fixture as any),
      orderedPageNames: [],
      registry: { components: {} },
      now: '2026-07-08T00:00:00.000Z'
    })
    expect(result.screenFrameCount).toBe(1)
    expect(result.screenEntries['D02.6 Chat']).toEqual({
      nodeId: '10:2',
      kind: 'screen',
      status: 'audit-clean',
      lastSyncedAt: '2026-07-08T00:00:00.000Z'
    })
  })

  it('is a no-op for an already-registered screen at the same nodeId', () => {
    const result = buildPullRegistryResult({
      liveComponents: [],
      liveScreenFrames: marshalScreenFrames(fixture as any),
      orderedPageNames: [],
      registry: { components: { 'D02.6 Chat': { nodeId: '10:2', kind: 'screen', status: 'audit-clean', lastSyncedAt: 'old' } } },
      now: '2026-07-08T00:00:00.000Z'
    })
    expect(result.screenEntries).toEqual({})
    expect(result.screenChanged).toEqual([])
  })
})

describe('token', () => {
  it('throws the documented message when neither FIGMA_TOKEN nor .argo/figma-token is set', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pull-registry-token-'))
    const original = process.env.FIGMA_TOKEN
    delete process.env.FIGMA_TOKEN
    try {
      expect(() => token(cwd)).toThrow(/No Figma token/)
    } finally {
      if (original !== undefined) process.env.FIGMA_TOKEN = original
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reads FIGMA_TOKEN from the environment when set', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pull-registry-token-'))
    const original = process.env.FIGMA_TOKEN
    process.env.FIGMA_TOKEN = 'test-token-value'
    try {
      expect(token(cwd)).toBe('test-token-value')
    } finally {
      if (original === undefined) delete process.env.FIGMA_TOKEN
      else process.env.FIGMA_TOKEN = original
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
