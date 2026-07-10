import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getGate } from '../../../core/index.js'
import { registerCliGates } from './register-cli-gates.js'

function scratchWithReceipt(receipt: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'cli-gates-'))
  mkdirSync(join(dir, 'design'), { recursive: true })
  writeFileSync(join(dir, 'design', 'audit-receipt.json'), JSON.stringify(receipt))
  return dir
}

describe('registerCliGates', () => {
  it('is idempotent and registers the headless gate set', () => {
    registerCliGates()
    registerCliGates()
    expect(getGate('design-rules-check')).toBeTruthy()
    expect(getGate('brief-check')).toBeTruthy()
    expect(getGate('fresh-eyes-review')).toBeTruthy()
    expect(getGate('design-matches-code')).toBeUndefined()
  })

  it('design-rules-check passes on a clean receipt covering the target', async () => {
    registerCliGates()
    const cwd = scratchWithReceipt({ componentNames: ['SessionCard'], violationCount: 0 })
    const verdict = await getGate('design-rules-check')!.check({
      target: 'SessionCard',
      artifacts: {},
      settings: { cwd }
    })
    expect(verdict.passed).toBe(true)
    expect(verdict.evidence[0]).toContain('audit-receipt.json')
  })

  it('design-rules-check fails on violations, wrong target, or missing receipt', async () => {
    registerCliGates()
    const gate = getGate('design-rules-check')!

    const dirty = scratchWithReceipt({ componentNames: ['SessionCard'], violationCount: 2 })
    expect((await gate.check({ target: 'SessionCard', artifacts: {}, settings: { cwd: dirty } })).passed).toBe(false)

    const wrongTarget = scratchWithReceipt({ componentNames: ['Card'], violationCount: 0 })
    expect((await gate.check({ target: 'SessionCard', artifacts: {}, settings: { cwd: wrongTarget } })).passed).toBe(false)

    const empty = mkdtempSync(join(tmpdir(), 'cli-gates-empty-'))
    expect((await gate.check({ target: 'SessionCard', artifacts: {}, settings: { cwd: empty } })).passed).toBe(false)
  })
})
