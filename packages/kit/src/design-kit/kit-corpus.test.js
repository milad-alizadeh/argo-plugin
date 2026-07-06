/**
 * R7 (unanimous): "pristine kit instance must pass tier-0" CI fixture, built
 * from real marshaled kit shapes (seeded from live-observed facts — see the
 * corpus header — not hand-authored synthetic shapes like `{remote: true,
 * key: 'kit-file-key:1:2'}`, which passed green while encoding the exact
 * wrong `key.startsWith(fileKey)` assumption this fixture exists to prevent
 * recurring). Re-capture via `argo design capture-kit-corpus` on kit upgrade
 * (design-upgrade/D15) so the fixture tracks the kit it certifies.
 *
 * Guardrail (YAGNI, R7): one pristine instance per rule category — this is
 * NOT a general snapshot framework.
 */
import { describe, it, expect } from 'vitest'
import { runPureTier0Audit } from '../../../../test/helpers/runPureTier0Audit.mjs'
import corpus from '../../../../test/fixtures/kit-corpus.json' with { type: 'json' }

describe('R7 pristine kit corpus', () => {
  it('produces zero violations across the whole pristine corpus', () => {
    const violations = runPureTier0Audit(corpus.pristine, { semanticModes: corpus.semanticModes })
    expect(violations).toEqual([])
  })
})

describe('R7 inverse fixtures (must each hard-fail their target rule)', () => {
  it('flags a genuinely detached instance', () => {
    const violations = runPureTier0Audit([corpus.inverse['detached-instance']])
    expect(violations.some((v) => v.rule === 'detached-instance')).toBe(true)
  })

  it('flags an illegal kit-instance override (geometry/corner-radius/effects)', () => {
    const violations = runPureTier0Audit([corpus.inverse['kit-instance-override']])
    expect(violations.some((v) => v.rule === 'kit-instance-override')).toBe(true)
  })

  it('flags a chunky unscaled stroke (NEW-3)', () => {
    const violations = runPureTier0Audit([corpus.inverse['stroke-scale-mismatch']])
    expect(violations.some((v) => v.rule === 'stroke-scale-mismatch')).toBe(true)
  })
})
