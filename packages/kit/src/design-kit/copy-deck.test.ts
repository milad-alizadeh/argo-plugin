import { describe, it, expect } from 'vitest'
import { CopyDeckSchema, copyDeckStrings } from './copy-deck.js'

const deck = {
  wave: 'D03-wave',
  sharedTerms: { workflow: 'Workflow', session: 'Session' },
  entries: [
    { region: 'header', key: 'title', text: 'Workflow detail' },
    { region: 'header', key: 'entity', sharedTerm: 'workflow' },
    { region: 'empty-state', key: 'cta', text: 'Start a workflow' }
  ]
}

describe('CopyDeckSchema', () => {
  it('accepts a wave-scoped deck with shared terms and region→key→string entries', () => {
    expect(CopyDeckSchema.safeParse(deck).success).toBe(true)
  })

  it('rejects an entry carrying neither text nor sharedTerm', () => {
    const bad = { ...deck, entries: [{ region: 'r', key: 'k' }] }
    expect(CopyDeckSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an entry carrying BOTH text and sharedTerm (one source per string)', () => {
    const bad = { ...deck, entries: [{ region: 'r', key: 'k', text: 'x', sharedTerm: 'workflow' }] }
    expect(CopyDeckSchema.safeParse(bad).success).toBe(false)
  })
})

describe('copyDeckStrings', () => {
  it('flattens entries + shared terms into the allowed-string list', () => {
    const strings = copyDeckStrings(deck)
    expect(strings).toContain('Workflow detail')
    expect(strings).toContain('Start a workflow')
    expect(strings).toContain('Workflow')
    expect(strings).toContain('Session')
  })

  it('throws on a sharedTerm reference with no matching key (drift must not pass silently)', () => {
    const bad = { ...deck, entries: [{ region: 'r', key: 'k', sharedTerm: 'nope' }] }
    expect(() => copyDeckStrings(bad)).toThrow(/sharedTerm "nope"/)
  })
})
