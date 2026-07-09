import { describe, expect, it } from 'vitest'
import { runSyncCheck, SYNC_CHECK_LIMITATION } from './sync-check.js'

const entry = (kind: string, extra: Record<string, unknown> = {}) => ({
  nodeId: '1:1',
  kind,
  status: 'audit-clean',
  lastSyncedAt: '2026-07-01T00:00:00.000Z',
  variantMatrix: {},
  ...extra
})

const cleanReceipt = { recordedAt: 1, exitCode: 0 }

describe('runSyncCheck', () => {
  it('reports clean when every adopted entry has a spec and the receipt passed', () => {
    const report = runSyncCheck({
      registry: { components: { Card: entry('custom') } },
      specComponents: ['Card'],
      specDiffReceipt: cleanReceipt,
      now: new Date('2026-07-09T00:00:00Z')
    })
    expect(report.status).toBe('clean')
    expect(report.findings).toEqual([])
    expect(report.scope.swept).toEqual(['Card'])
    expect(report.limitation).toBe(SYNC_CHECK_LIMITATION)
    expect(report.checkedAt).toBe('2026-07-09T00:00:00.000Z')
  })

  it('flags an adopted entry with no committed spec as missing-spec', () => {
    const report = runSyncCheck({
      registry: { components: { Card: entry('custom') } },
      specComponents: [],
      specDiffReceipt: cleanReceipt
    })
    expect(report.status).toBe('dirty')
    expect(report.findings).toEqual([
      expect.objectContaining({ rule: 'missing-spec', component: 'Card' }),
    ])
  })

  it('skips raw un-adopted kit as advisory but sweeps adopted kit hard', () => {
    const report = runSyncCheck({
      registry: {
        components: {
          RawButton: entry('kit'),
          UsedButton: entry('kit', { adopted: true })
        }
      },
      specComponents: ['UsedButton'],
      specDiffReceipt: cleanReceipt
    })
    expect(report.scope.advisorySkipped).toEqual(['RawButton'])
    expect(report.scope.swept).toEqual(['UsedButton'])
    expect(report.status).toBe('clean')
  })

  it('exempts screens and code-owned entries from the missing-spec rule', () => {
    const report = runSyncCheck({
      registry: {
        components: {
          Home: entry('screen'),
          Scene: entry('code-owned', { codePath: 'src/Scene.tsx' })
        }
      },
      specComponents: [],
      specDiffReceipt: cleanReceipt
    })
    expect(report.scope.exempt).toEqual(['Home', 'Scene'])
    expect(report.findings).toEqual([])
  })

  it('flags orphan specs, schema-invalid entries, and a failing/absent spec-diff receipt', () => {
    const failing = runSyncCheck({
      registry: { components: { Broken: { kind: 'custom' } } },
      specComponents: ['Ghost'],
      specDiffReceipt: { recordedAt: 1, exitCode: 1 }
    })
    const rules = failing.findings.map((f) => f.rule)
    expect(rules).toContain('invalid-registry-entry')
    expect(rules).toContain('orphan-spec')
    expect(rules).toContain('spec-diff-receipt')

    const noReceipt = runSyncCheck({ registry: { components: {} }, specComponents: [] })
    expect(noReceipt.findings).toEqual([expect.objectContaining({ rule: 'spec-diff-receipt' })])
    expect(noReceipt.status).toBe('dirty')
  })
})
