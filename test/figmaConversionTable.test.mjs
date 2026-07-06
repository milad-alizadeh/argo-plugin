import { describe, it, expect } from 'vitest'
import { convertLineHeight, convertLetterSpacing, resolveBoxModel } from '../packages/kit/src/design-kit/conversion-table.js'

describe('convertLineHeight', () => {
  it('converts PERCENT to a unitless CSS line-height', () => {
    expect(convertLineHeight(150, 'PERCENT')).toBe('1.5')
  })

  it('converts PIXELS to a px CSS line-height', () => {
    expect(convertLineHeight(24, 'PIXELS')).toBe('24px')
  })

  it('converts AUTO to CSS normal', () => {
    expect(convertLineHeight(0, 'AUTO')).toBe('normal')
  })

  it('throws on an unknown unit', () => {
    expect(() => convertLineHeight(1, 'BOGUS')).toThrow()
  })
})

describe('convertLetterSpacing', () => {
  it('converts a percent value to em and px given a font size', () => {
    const result = convertLetterSpacing(2, 16)
    expect(result.em).toBeCloseTo(0.02)
    expect(result.px).toBeCloseTo(0.32)
  })

  it('is zero for zero percent', () => {
    const result = convertLetterSpacing(0, 16)
    expect(result.em).toBe(0)
    expect(result.px).toBe(0)
  })
})

describe('resolveBoxModel', () => {
  it('resolves FIXED to an exact-match check', () => {
    expect(resolveBoxModel('FIXED')).toEqual({ checkType: 'fixed', tolerance: 0 })
  })

  it('resolves HUG to a tolerant check feeding compareHugDimension', () => {
    const result = resolveBoxModel('HUG')
    expect(result.checkType).toBe('hug')
    expect(result.tolerance).toBeGreaterThan(0)
  })

  it('allows overriding the HUG tolerance', () => {
    const result = resolveBoxModel('HUG', { hugTolerance: 5 })
    expect(result.tolerance).toBe(5)
  })

  it('resolves FILL to a skipped check (container-dependent)', () => {
    expect(resolveBoxModel('FILL')).toEqual({ checkType: 'skip', tolerance: null })
  })

  it('throws on an unknown layoutSizing value', () => {
    expect(() => resolveBoxModel('BOGUS')).toThrow()
  })
})
