import { describe, expect, it } from 'vitest'
import { hashTemplateContent, diffProvenance } from './provenance.js'

describe('hashTemplateContent', () => {
  it('is deterministic for identical content', () => {
    expect(hashTemplateContent('# Testing Rules\n')).toBe(hashTemplateContent('# Testing Rules\n'))
  })

  it('differs when content differs', () => {
    expect(hashTemplateContent('a')).not.toBe(hashTemplateContent('b'))
  })
})

describe('diffProvenance', () => {
  it('reports a file up to date when its recorded hash matches the current template hash', () => {
    const result = diffProvenance({
      recorded: { '.claude/rules/testing.md': 'abc' },
      current: { '.claude/rules/testing.md': 'abc' }
    })
    expect(result).toEqual({ upToDate: ['.claude/rules/testing.md'], diverged: [], unrecorded: [] })
  })

  it('reports a file diverged when its recorded hash no longer matches the current template hash', () => {
    const result = diffProvenance({
      recorded: { '.claude/rules/testing.md': 'abc' },
      current: { '.claude/rules/testing.md': 'xyz' }
    })
    expect(result).toEqual({ upToDate: [], diverged: ['.claude/rules/testing.md'], unrecorded: [] })
  })

  it('reports a currently-installed template file with no recorded provenance as unrecorded, never diverged', () => {
    // A file installed by hand (not from a template) has no entry — this is
    // the documented "never flagged" case (init skill §5): unrecorded is a
    // distinct, lower-severity bucket from diverged.
    const result = diffProvenance({ recorded: {}, current: { '.claude/rules/testing.md': 'abc' } })
    expect(result).toEqual({ upToDate: [], diverged: [], unrecorded: ['.claude/rules/testing.md'] })
  })

  it('ignores a recorded entry whose template no longer exists in the current template set', () => {
    const result = diffProvenance({ recorded: { '.claude/rules/retired.md': 'abc' }, current: {} })
    expect(result).toEqual({ upToDate: [], diverged: [], unrecorded: [] })
  })
})
