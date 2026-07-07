import { describe, it, expect } from 'vitest'
import { diffVariantShape } from './variant-shape-diff.js'

describe('diffVariantShape', () => {
  it('reports no change when the matrix is identical', () => {
    expect(diffVariantShape({ size: ['sm', 'lg'] }, { size: ['sm', 'lg'] })).toEqual({
      changed: false,
      added: [],
      removed: [],
      renamed: []
    })
  })

  it('reports an added prop', () => {
    expect(diffVariantShape({ size: ['sm'] }, { size: ['sm'], tone: ['default'] })).toEqual({
      changed: true,
      added: ['tone'],
      removed: [],
      renamed: []
    })
  })

  it('reports a removed prop', () => {
    expect(diffVariantShape({ size: ['sm'], tone: ['default'] }, { size: ['sm'] })).toEqual({
      changed: true,
      added: [],
      removed: ['tone'],
      renamed: []
    })
  })

  it('reports changed: true when a shared prop\'s enum values differ, with no key added/removed/renamed', () => {
    expect(diffVariantShape({ size: ['sm', 'lg'] }, { size: ['sm', 'md'] })).toEqual({
      changed: true,
      added: [],
      removed: [],
      renamed: []
    })
  })

  it('treats a removed+added prop pair with an identical value set as a rename', () => {
    expect(diffVariantShape({ tone: ['default', 'muted'] }, { variant: ['default', 'muted'] })).toEqual({
      changed: true,
      added: [],
      removed: [],
      renamed: [['tone', 'variant']]
    })
  })
})
