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

  // 'content-start-misaligned' is intentionally absent: not reachable through the
  // composed pipeline by construction (clusters are built on the same content-start-x
  // tolerance the check re-verifies) — unit-tested directly against hand-built clusters
  // in geometry-rules.test.ts. See geometry-row-model-fix.md, Known Limitation.
  // 'row-height-inconsistent' is gone: kind-varying row height is legitimate.
  it('covers every geometry rule the composed pass runs', () => {
    expect(rules.sort()).toEqual(
      [
        'missing-role-tags',
        'rail-anchor-span-mismatch',
        'rail-continuity-gap',
        'indent-step-inconsistent',
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
    'rail-anchor-span-mismatch',
    'rail-continuity-gap',
    'indent-step-inconsistent',
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

describe('regression: flat instance-list (geometry-row-model-mismatch.md, 2026-07-08 dogfood)', () => {
  it('produces zero violations on a real 6-row flat tree/list render', () => {
    // Old heuristics produced ~40 false positives on this exact shape (live TreeNode).
    expect(runPureGeometryAudit(corpus.regressions.flatTreeNodeList)).toEqual([])
  })
})
