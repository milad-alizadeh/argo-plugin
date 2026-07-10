import { describe, it, expect } from 'vitest'
import { isDesignerTranscript } from './block-designer-spawn.js'

describe('isDesignerTranscript', () => {
  it('detects a designer session from its system-prompt marker text', () => {
    const transcript = 'some line\nYou build and edit designs inside a live Figma file: components, screens, and\nmore'
    expect(isDesignerTranscript(transcript)).toBe(true)
  })

  it('returns false for a non-designer transcript', () => {
    expect(isDesignerTranscript('some unrelated transcript content')).toBe(false)
  })
})
