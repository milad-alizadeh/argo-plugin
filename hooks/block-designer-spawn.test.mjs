import { describe, it, expect } from 'vitest'
import { isDesignerTranscript } from './block-designer-spawn.mjs'

describe('isDesignerTranscript', () => {
  it('detects a designer session from its system-prompt marker text', () => {
    const transcript = 'some line\nYou build and edit designs inside a live Figma file: components, screens, and\nmore'
    expect(isDesignerTranscript(transcript)).toBe(true)
  })
})
