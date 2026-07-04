import { describe, it, expect } from 'vitest'
import {
  WaiverSchema,
  KitPatchSchema,
  KitLockSchema,
  StoryMapEntrySchema
} from '../packages/figma-design-kit/schemas.js'

describe('WaiverSchema', () => {
  const valid = {
    component: 'Button',
    variant: 'primary',
    property: 'borderRadius',
    figmaValue: 8,
    codeValue: 9,
    kitLockVersion: 'v12',
    reason: 'known kit drift, tracked in issue #42',
    date: '2026-07-04'
  }

  it('accepts the D15 shape', () => {
    expect(WaiverSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a waiver missing kitLockVersion', () => {
    const { kitLockVersion, ...missing } = valid
    expect(WaiverSchema.safeParse(missing).success).toBe(false)
  })
})

describe('KitPatchSchema', () => {
  it('accepts the D13/D15 shape', () => {
    const valid = {
      component: 'Button',
      file: 'button.tsx',
      description: 'local override for icon spacing',
      date: '2026-07-04'
    }
    expect(KitPatchSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a patch missing description', () => {
    const missing = { component: 'Button', file: 'button.tsx', date: '2026-07-04' }
    expect(KitPatchSchema.safeParse(missing).success).toBe(false)
  })
})

describe('KitLockSchema', () => {
  it('accepts the D4 shape with freshness metadata', () => {
    const valid = {
      kitVersion: '1.4.0',
      importDate: '2026-07-01',
      libraryFileKey: 'abc123',
      fileVersion: '42',
      lastModified: '2026-06-30T00:00:00Z',
      syncTimestamp: '2026-07-01T00:00:00Z'
    }
    expect(KitLockSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a kit.lock missing freshness metadata', () => {
    const missing = { kitVersion: '1.4.0', importDate: '2026-07-01', libraryFileKey: 'abc123' }
    expect(KitLockSchema.safeParse(missing).success).toBe(false)
  })
})

describe('StoryMapEntrySchema', () => {
  it('accepts the D1 shape with prop mapping', () => {
    const valid = {
      componentKey: 'button',
      nodeId: '12:34',
      storyId: 'components-button--primary',
      importPath: './Button.tsx',
      propMapping: { size: 'md', variant: 'primary' }
    }
    expect(StoryMapEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an entry missing nodeId', () => {
    const missing = {
      componentKey: 'button',
      storyId: 'components-button--primary',
      importPath: './Button.tsx',
      propMapping: {}
    }
    expect(StoryMapEntrySchema.safeParse(missing).success).toBe(false)
  })
})
