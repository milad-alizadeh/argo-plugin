import { describe, it, expect } from 'vitest'
import { DEFAULT_COMPONENT_CATEGORIES, resolveComponentCategories, validateComponentCategories } from './component-categories.js'

describe('resolveComponentCategories', () => {
  it('falls back to the default thin enum when a project sets none', () => {
    expect(resolveComponentCategories({})).toEqual(DEFAULT_COMPONENT_CATEGORIES)
  })

  it("reads the design block's top-level componentCategories", () => {
    expect(resolveComponentCategories({ componentCategories: ['primitive', 'composite', 'screen'] })).toEqual([
      'primitive',
      'composite',
      'screen'
    ])
  })
})

describe('validateComponentCategories', () => {
  it('validates the default config', () => {
    expect(validateComponentCategories(DEFAULT_COMPONENT_CATEGORIES).valid).toBe(true)
  })

  it('fails an empty categories array', () => {
    expect(validateComponentCategories([]).valid).toBe(false)
  })
})
