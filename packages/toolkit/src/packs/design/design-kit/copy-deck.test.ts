import { describe, it, expect } from 'vitest'
import { CopyDeckSchema, copyDeckStrings } from './copy-deck.js'

const deck = {
  wave: 'D03-wave',
  sharedTerms: { playbook: 'Playbook', session: 'Session' },
  entries: [
    { region: 'header', key: 'title', text: 'Playbook detail' },
    { region: 'header', key: 'entity', sharedTerm: 'playbook' },
    { region: 'empty-state', key: 'cta', text: 'Start a playbook' }
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
    const bad = { ...deck, entries: [{ region: 'r', key: 'k', text: 'x', sharedTerm: 'playbook' }] }
    expect(CopyDeckSchema.safeParse(bad).success).toBe(false)
  })
})

describe('copyDeckStrings', () => {
  it('flattens entries + shared terms into the allowed-string list', () => {
    const strings = copyDeckStrings(deck)
    expect(strings).toContain('Playbook detail')
    expect(strings).toContain('Start a playbook')
    expect(strings).toContain('Playbook')
    expect(strings).toContain('Session')
  })

  it('throws on a sharedTerm reference with no matching key (drift must not pass silently)', () => {
    const bad = { ...deck, entries: [{ region: 'r', key: 'k', sharedTerm: 'nope' }] }
    expect(() => copyDeckStrings(bad)).toThrow(/sharedTerm "nope"/)
  })
})
