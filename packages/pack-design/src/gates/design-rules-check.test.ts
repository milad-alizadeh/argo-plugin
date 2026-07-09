import { describe, expect, it } from 'vitest'
import type { GateInput } from '@argohq/core'
import { createDesignRulesCheckGate, type FigmaVariableBinding } from './design-rules-check.js'

const makeInput = (): GateInput => ({ target: 'component/Button', artifacts: {}, settings: {} })

describe('design-rules-check gate', () => {
  it('fails on a fixture with a known tier0 violation (non-semantic binding)', async () => {
    const bindings: FigmaVariableBinding[] = [
      { remote: false, key: 'v1', collectionName: 'Semantic', nodeName: 'bg' },
      { remote: false, key: 'v2', collectionName: 'Primitives', nodeName: 'border' } // violation: not Semantic, not tw/*
    ]

    const gate = createDesignRulesCheckGate({
      readFigma: async () => ({ bindings }),
      cwd: process.cwd()
    })

    const verdict = await gate.check(makeInput())

    expect(verdict.passed).toBe(false)
    expect(verdict.findings).toHaveLength(1)
    expect(verdict.findings[0].message).toMatch(/non-semantic-binding/)
    expect(verdict.findings[0].detail).toMatchObject({ rule: 'non-semantic-binding' })
  })

  it('passes on a clean fixture (all bindings resolve to Semantic or the tw/* family)', async () => {
    const bindings: FigmaVariableBinding[] = [
      { remote: false, key: 'v1', collectionName: 'Semantic' },
      { remote: false, key: 'v2', collectionName: 'tw/gap' }
    ]

    const gate = createDesignRulesCheckGate({
      readFigma: async () => ({ bindings }),
      cwd: process.cwd()
    })

    const verdict = await gate.check(makeInput())

    expect(verdict.passed).toBe(true)
    expect(verdict.findings).toHaveLength(0)
  })

  it("evidence points at bundle-tier0-audit's own receipt (bundle path + content hash)", async () => {
    const gate = createDesignRulesCheckGate({
      readFigma: async () => ({ bindings: [] }),
      cwd: process.cwd()
    })

    const verdict = await gate.check(makeInput())

    expect(verdict.evidence.some((e) => e.startsWith('tier0-audit-bundle:'))).toBe(true)
    expect(verdict.evidence.some((e) => e.startsWith('tier0-audit-hash:'))).toBe(true)
  })

  it('never reads Figma itself — only the injected readFigma function is consulted', async () => {
    let called = false
    const gate = createDesignRulesCheckGate({
      readFigma: async () => {
        called = true
        return { bindings: [] }
      },
      cwd: process.cwd()
    })

    await gate.check(makeInput())

    expect(called).toBe(true)
  })
})
