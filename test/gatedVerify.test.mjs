import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gateCommand, gatedVerify } from '../lib/gatedVerify.mjs'

const GATE = fileURLToPath(new URL('../hooks/trust-gate.mjs', import.meta.url))

/** Run a composed shell verify command in `cwd`; resolve its real exit code. */
function run(cmd, cwd) {
  return new Promise((resolve) => {
    execFile('bash', ['-c', cmd], { cwd }, (err) => resolve(err ? (err.code ?? 1) : 0))
  })
}
function writeExercisedReceipt(cwd) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(
    join(cwd, '.argo', 'launch-receipt.json'),
    JSON.stringify({
      sessionId: 's', startedAt: Date.now(), exitCode: 0, ptyByteCount: 99,
      exercised: true, evidence: { osc777: [], mcpStatuses: ['ok'] }, shape: 'node-web',
    }),
  )
}

describe('gatedVerify — chain the trust gate into Verify (§7)', () => {
  it('does NOT gate a pure-logic slice (requiresLaunch=false)', () => {
    expect(gatedVerify('bun run test', false, GATE)).toBe('bun run test')
  })

  it('chains the gate onto a launch-requiring slice', () => {
    const cmd = gatedVerify('bun run test', true, GATE)
    expect(cmd).toContain('bun run test')
    expect(cmd).toContain('&&')
    expect(cmd).toContain(GATE)
  })

  describe('the composed command behaves through the real shell interface', () => {
    let cwd
    beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-gv-')) })
    afterEach(() => rmSync(cwd, { recursive: true, force: true }))

    it('PASS: tests green + an exercised receipt → exit 0', async () => {
      writeExercisedReceipt(cwd)
      expect(await run(gatedVerify('true', true, GATE), cwd)).toBe(0)
    })

    it('RED: tests green but launch skipped (no receipt) → non-zero (the §8.2 acid case)', async () => {
      expect(await run(gatedVerify('true', true, GATE), cwd)).not.toBe(0)
    })

    it('RED: tests themselves fail → non-zero (gate never reached, && short-circuits)', async () => {
      writeExercisedReceipt(cwd) // even with a good receipt, failing tests block
      expect(await run(gatedVerify('false', true, GATE), cwd)).not.toBe(0)
    })

    it('gateCommand alone goes RED on a missing receipt', async () => {
      expect(await run(gateCommand(GATE), cwd)).not.toBe(0)
    })
  })
})
