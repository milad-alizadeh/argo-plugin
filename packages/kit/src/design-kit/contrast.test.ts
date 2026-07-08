import { describe, it, expect } from 'vitest'
import { contrastRatio, wcagContrastViolation } from './contrast.js'

const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

describe('contrastRatio', () => {
  it('white vs black is approximately 21 (known WCAG value)', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 0)
  })

  it('identical colors is exactly 1', () => {
    expect(contrastRatio(WHITE, WHITE)).toBe(1)
  })
})

describe('wcagContrastViolation', () => {
  it('passes at exactly the 4.5 normal-text threshold', () => {
    // gray #767676 on white resolves to ~4.54:1 (a known WCAG AA boundary example)
    expect(wcagContrastViolation({ r: 118, g: 118, b: 118 }, WHITE, false)).toBeNull()
  })

  it('fails just under the 4.5 normal-text threshold', () => {
    expect(wcagContrastViolation({ r: 150, g: 150, b: 150 }, WHITE, false)).toEqual({
      rule: 'wcag-contrast-fail',
      detail: expect.stringContaining('below the WCAG AA threshold (4.5:1 for normal text)')
    })
  })

  it('passes at exactly the 3.0 large-text threshold', () => {
    // gray #949494 on white resolves to ~3.0:1
    expect(wcagContrastViolation({ r: 148, g: 148, b: 148 }, WHITE, true)).toBeNull()
  })

  it('fails just under the large-text threshold', () => {
    expect(wcagContrastViolation({ r: 180, g: 180, b: 180 }, WHITE, true)).toEqual({
      rule: 'wcag-contrast-fail',
      detail: expect.stringContaining('below the WCAG AA threshold (3:1 for large text)')
    })
  })
})
