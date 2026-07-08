/**
 * Geometry corpus (fidelity-geometry-verifier.md Slice 9), same R7 economy
 * as kit-corpus.test.js: ONE pristine tree that produces zero violations,
 * plus ONE inverse fixture per rule category (numeric edge cases live in
 * geometry-rules.test.ts's own unit tests, not here).
 */
import { describe, it, expect } from 'vitest'
import { runPureGeometryAudit } from '../../../../test/helpers/runPureGeometryAudit.mjs'
import corpus from '../../../../test/fixtures/geometry-corpus.json' with { type: 'json' }

describe('geometry corpus: pristine tree', () => {
  it('produces zero violations', () => {
    expect(runPureGeometryAudit(corpus.pristine)).toEqual([])
  })
})

describe('geometry corpus: inverse fixtures (must each flag their target rule)', () => {
  const rules = Object.keys(corpus.inverse)

  it('covers every geometry rule the composed pass runs', () => {
    expect(rules.sort()).toEqual(
      [
        'missing-role-tags',
        'content-start-misaligned',
        'rail-anchor-span-mismatch',
        'rail-continuity-gap',
        'indent-inconsistent',
        'row-height-inconsistent',
        'load-bearing-node-hidden',
        'anchor-cross-axis-offset',
        'hug-overflow-horizontal',
        'touch-target-too-small',
        'wcag-contrast-fail'
      ].sort()
    )
  })

  for (const rule of [
    'missing-role-tags',
    'content-start-misaligned',
    'rail-anchor-span-mismatch',
    'rail-continuity-gap',
    'indent-inconsistent',
    'row-height-inconsistent',
    'load-bearing-node-hidden',
    'anchor-cross-axis-offset',
    'hug-overflow-horizontal',
    'touch-target-too-small',
    'wcag-contrast-fail'
  ]) {
    it(`flags "${rule}"`, () => {
      const violations = runPureGeometryAudit(corpus.inverse[rule])
      expect(violations.some((v) => v.rule === rule)).toBe(true)
    })
  }
})
