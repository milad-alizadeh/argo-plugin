import { describe, it, expect } from 'vitest'
import { KitPatchSchema, KitLockSchema } from '../packages/kit/src/design-kit/recipes/external-kit.js'

describe('figma-design-kit/recipes/external-kit subpath export', () => {
  it('exposes KitPatchSchema and KitLockSchema outside the mechanism entrypoint', () => {
    expect(KitPatchSchema).toBeDefined()
    expect(KitLockSchema).toBeDefined()
  })

  it('KitLockSchema still validates the D4 shape', () => {
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
})
