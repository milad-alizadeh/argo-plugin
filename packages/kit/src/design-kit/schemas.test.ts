import { describe, it, expect } from 'vitest'
import { StoryMapEntrySchema, RegistryEntrySchema, RegistryHeaderSchema } from './schemas.js'

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

describe('RegistryEntrySchema (design-memory-placement.md, thin pointer index, slimmed Slice 4)', () => {
  const valid = {
    nodeId: '12:34',
    kind: 'custom',
    status: 'audit-clean',
    lastSyncedAt: '2026-07-07T00:00:00Z',
    variantMatrix: { size: ['sm', 'md', 'lg'] }
  }

  it('accepts the slim 5-field shape (reusing nodeId as the story-map join key)', () => {
    expect(RegistryEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a null lastSyncedAt (never-synced entry)', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, lastSyncedAt: null }).success).toBe(true)
  })

  it('accepts both kind values (kit vs custom)', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, kind: 'kit' }).success).toBe(true)
    expect(RegistryEntrySchema.safeParse({ ...valid, kind: 'custom' }).success).toBe(true)
  })

  it('accepts kind code-owned with a codePath (the code implementation lives in the repo, Figma carries only a screenshot)', () => {
    const result = RegistryEntrySchema.safeParse({
      ...valid,
      kind: 'code-owned',
      codePath: 'src/renderer/src/components/scene-wallpaper/SceneWallpaper.tsx'
    })
    expect(result.success).toBe(true)
    expect(result.data?.codePath).toBe('src/renderer/src/components/scene-wallpaper/SceneWallpaper.tsx')
  })

  it('accepts an entry with no codePath (kit/custom entries never carry one)', () => {
    expect(RegistryEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a kind outside kit|custom|code-owned', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, kind: 'controls' }).success).toBe(false)
  })

  it('rejects a status outside draft|audit-clean|out-of-sync|orphaned (synced/coded are derived, never stored)', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, status: 'synced' }).success).toBe(false)
  })

  it('accepts out-of-sync and orphaned statuses (decision 8 staleness classification)', () => {
    expect(RegistryEntrySchema.safeParse({ ...valid, status: 'out-of-sync' }).success).toBe(true)
    expect(RegistryEntrySchema.safeParse({ ...valid, status: 'orphaned' }).success).toBe(true)
  })

  it('rejects an entry that still carries the dropped category/provenance fields as extras only if malformed variantMatrix accompanies them', () => {
    // dropped fields are simply ignored by zod's default (non-strict) object parsing when the
    // required 5 are present — the drop is enforced by absence from the schema, not by rejection.
    // description is no longer dropped (owner addendum), so it's exercised separately below.
    const withOldFields = { ...valid, category: 'controls', provenance: { createdBy: 'x' } }
    expect(RegistryEntrySchema.safeParse(withOldFields).success).toBe(true)
  })

  it('rejects a missing variantMatrix', () => {
    const { variantMatrix, ...withoutVariantMatrix } = valid
    expect(RegistryEntrySchema.safeParse(withoutVariantMatrix).success).toBe(false)
  })

  it('accepts an optional description and retains it in the parsed output (owner addendum: registry entries carry Figma component descriptions)', () => {
    const result = RegistryEntrySchema.safeParse({ ...valid, description: 'Primary action button.' })
    expect(result.success).toBe(true)
    expect(result.data?.description).toBe('Primary action button.')
  })

  it('accepts an entry with no description at all', () => {
    expect(RegistryEntrySchema.safeParse(valid).success).toBe(true)
  })
})

describe('RegistryHeaderSchema', () => {
  it('accepts the freshness header shape', () => {
    const header = { figmaFileVersion: '42', syncedAtWriteCount: 3, syncedAt: '2026-07-05T00:00:00Z' }
    expect(RegistryHeaderSchema.safeParse(header).success).toBe(true)
  })
})
