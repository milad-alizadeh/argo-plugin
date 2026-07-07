import { describe, it, expect } from 'vitest'
import { WaiverSchema, StoryMapEntrySchema, RegistryEntrySchema, RegistryHeaderSchema } from './schemas.js'

describe('WaiverSchema', () => {
  const valid = {
    component: 'Button',
    variant: 'primary',
    property: 'borderRadius',
    figmaValue: 8,
    codeValue: 9,
    sourceVersion: 'v12',
    reason: 'known kit drift, tracked in issue #42',
    date: '2026-07-04'
  }

  it('accepts the D15 shape (generic sourceVersion pin)', () => {
    expect(WaiverSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a waiver missing sourceVersion', () => {
    const { sourceVersion, ...missing } = valid
    expect(WaiverSchema.safeParse(missing).success).toBe(false)
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

describe('RegistryEntrySchema (design-memory-placement.md, thin pointer index)', () => {
  const valid = {
    nodeId: '12:34',
    category: 'controls',
    status: 'audit-clean',
    description: 'Primary call-to-action button',
    provenance: { createdBy: 'figma-create', lastTask: 'build Button', lastAudit: { auditedAt: '2026-07-05T00:00:00Z', clean: true } }
  }

  it('accepts the thin pointer-index shape (reusing nodeId as the story-map join key)', () => {
    expect(RegistryEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a status outside draft|audit-clean (synced/coded are derived, never stored)', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, status: 'synced' }).success).toBe(false)
  })
})

describe('RegistryHeaderSchema', () => {
  it('accepts the freshness header shape', () => {
    const header = { figmaFileVersion: '42', syncedAtWriteCount: 3, syncedAt: '2026-07-05T00:00:00Z' }
    expect(RegistryHeaderSchema.safeParse(header).success).toBe(true)
  })
})
