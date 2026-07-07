import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { marshalRestDocument, buildPullRegistryResult, token } from './pull-registry.js'
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
          componentPropertyDefinitions: {},
          description: 'Session summary card used in the dashboard list.'
        },
        {
          name: 'Buttons',
          nodeId: '2:2',
          pageName: 'Buttons',
          componentPropertyDefinitions: {
            size: { type: 'VARIANT', variantOptions: ['sm', 'md', 'lg'] },
            disabled: { type: 'BOOLEAN' }
          },
          description: 'Primary/secondary/ghost button variants.'
        },
        { name: 'lucide/arrow-right', nodeId: '2:3', pageName: 'Buttons', componentPropertyDefinitions: undefined },
        {
          name: 'Dialog',
          nodeId: '3:3',
          pageName: 'Overlays',
          componentPropertyDefinitions: { size: { type: 'VARIANT', variantOptions: ['sm', 'md'] } }
        },
        { name: 'Throwaway', nodeId: '4:2', pageName: 'Scratch - wip', componentPropertyDefinitions: undefined }
      ])
    )
  })

  it('excludes non-component nodes (a plain FRAME on Custom Components)', () => {
    const components = marshalRestDocument(fixture as any)
    expect(components.some((c) => c.name === 'Not A Component Frame')).toBe(false)
  })

  it('returns exactly the 5 real components, no more', () => {
    const components = marshalRestDocument(fixture as any)
    expect(components).toHaveLength(5)
  })
})

describe('buildPullRegistryResult', () => {
  it('classifies kit vs custom by page name and upserts only newly-seen kit components', () => {
    const liveComponents = marshalRestDocument(fixture as any)
    const result = buildPullRegistryResult({
      liveComponents,
      registry: { components: {} },
      now: '2026-07-07T00:00:00.000Z'
    })
    // Custom Components (SessionCard) and Scratch (Throwaway, sandbox — never "kit") are non-kit pages.
    expect(result.customComponentCount).toBe(2)
    // Kit pages: Buttons (Buttons, lucide/arrow-right) and Overlays (Dialog).
    expect(result.kitComponentCount).toBe(3)
    expect(Object.keys(result.newEntries).sort()).toEqual(['Buttons', 'Dialog'])
    expect(result.newEntries.Buttons.kind).toBe('kit')
    expect(result.newEntries.Buttons.description).toBe('Primary/secondary/ghost button variants.')
  })

  it('leaves an already-registered kit component untouched', () => {
    const liveComponents = marshalRestDocument(fixture as any)
    const result = buildPullRegistryResult({
      liveComponents,
      registry: { components: { Buttons: { nodeId: '2:2', kind: 'kit', status: 'audit-clean', lastSyncedAt: null, variantMatrix: {} } } },
      now: '2026-07-07T00:00:00.000Z'
    })
    expect(Object.keys(result.newEntries)).toEqual(['Dialog'])
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
