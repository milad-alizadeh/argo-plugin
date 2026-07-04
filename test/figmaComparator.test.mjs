import { describe, it, expect } from 'vitest'
import { compareColor, comparePxInteger, compareHugDimension, srgbToOklch } from '../packages/figma-design-kit/comparator.js'

describe('compareColor', () => {
  it('passes when figma and css colors are identical', () => {
    const result = compareColor({ r: 1, g: 0, b: 0, a: 1 }, '#ff0000')
    expect(result.pass).toBe(true)
    expect(result.maxDelta).toBe(0)
  })

  it('fails a 1-unit-over-epsilon channel diff with a named delta', () => {
    const result = compareColor({ r: 2 / 255, g: 0, b: 0, a: 1 }, '#000000')
    expect(result.pass).toBe(false)
    expect(result.delta.r).toBe(2)
  })

  it('round-trips oklch vs sRGB at token boundaries: black, white, mid-gray', () => {
    const boundaries = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 128 / 255, g: 128 / 255, b: 128 / 255 }
    ]
    for (const srgb of boundaries) {
      const { L, C, H } = srgbToOklch(srgb)
      const cssColor = `oklch(${L} ${C} ${H})`
      const result = compareColor({ ...srgb, a: 1 }, cssColor)
      expect(result.pass).toBe(true)
    }
  })
})

describe('comparePxInteger', () => {
  it('is byte-exact for radius/spacing/border/font-size', () => {
    expect(comparePxInteger(8, 8).pass).toBe(true)
    expect(comparePxInteger(8, 9).pass).toBe(false)
    expect(comparePxInteger(8, 9).delta).toBe(1)
  })
})

describe('compareHugDimension', () => {
  it('passes within tolerance and fails with a named delta over tolerance', () => {
    const withinTolerance = compareHugDimension(100, 101, 2)
    expect(withinTolerance.pass).toBe(true)

    const overTolerance = compareHugDimension(100, 105, 2)
    expect(overTolerance.pass).toBe(false)
    expect(overTolerance.delta).toBe(5)
  })

  it('requires an exact match for fixed dimensions (zero tolerance)', () => {
    const exact = compareHugDimension(100, 100, 0)
    expect(exact.pass).toBe(true)

    const off = compareHugDimension(100, 101, 0)
    expect(off.pass).toBe(false)
  })
})
