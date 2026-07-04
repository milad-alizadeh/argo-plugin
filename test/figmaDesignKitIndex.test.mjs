import { describe, it, expect } from 'vitest'
import * as figmaDesignKit from '../packages/figma-design-kit/index.js'

describe('figma-design-kit package entrypoint', () => {
  it('re-exports every module the package.json exports field promises', () => {
    expect(typeof figmaDesignKit.compareColor).toBe('function')
    expect(typeof figmaDesignKit.comparePxInteger).toBe('function')
    expect(typeof figmaDesignKit.compareHugDimension).toBe('function')
    expect(typeof figmaDesignKit.convertLineHeight).toBe('function')
    expect(typeof figmaDesignKit.convertLetterSpacing).toBe('function')
    expect(typeof figmaDesignKit.resolveBoxModel).toBe('function')
    expect(figmaDesignKit.WaiverSchema).toBeDefined()
    expect(figmaDesignKit.KitPatchSchema).toBeDefined()
    expect(figmaDesignKit.KitLockSchema).toBeDefined()
    expect(figmaDesignKit.StoryMapEntrySchema).toBeDefined()
    expect(typeof figmaDesignKit.checkWaiver).toBe('function')
    expect(typeof figmaDesignKit.invalidateWaivers).toBe('function')
  })
})
