import { describe, expect, it } from 'vitest'
import { hashOf, isAiOwned, listEditedPages, markHumanOwned, recordGenerated } from './docs-manifest.mjs'

describe('hashOf', () => {
  it('is stable across identical content', () => {
    expect(hashOf('hello world')).toBe(hashOf('hello world'))
  })
})

describe('isAiOwned', () => {
  it('is true when the recorded hash matches current content', () => {
    const manifest = recordGenerated('a.md', 'content', {})
    expect(isAiOwned('a.md', 'content', manifest)).toBe(true)
  })

  it('is false when the recorded hash no longer matches', () => {
    const manifest = recordGenerated('a.md', 'content', {})
    expect(isAiOwned('a.md', 'edited content', manifest)).toBe(false)
  })

  it('treats a manifest-missing page as human-owned (safe default)', () => {
    expect(isAiOwned('untracked.md', 'anything', {})).toBe(false)
  })
})

describe('listEditedPages', () => {
  it('returns exactly the entries whose current content diverges from the recorded hash', () => {
    let manifest = recordGenerated('unedited.md', 'same', {})
    manifest = recordGenerated('edited.md', 'original', manifest)
    const currentContent = { 'unedited.md': 'same', 'edited.md': 'changed' }
    const result = listEditedPages(manifest, (path) => currentContent[path])
    expect(result).toEqual(['edited.md'])
  })
})

describe('markHumanOwned', () => {
  it('removes the page so it is no longer reported by listEditedPages', () => {
    let manifest = recordGenerated('edited.md', 'original', {})
    manifest = markHumanOwned('edited.md', manifest)
    const result = listEditedPages(manifest, () => 'changed')
    expect(result).toEqual([])
  })
})
