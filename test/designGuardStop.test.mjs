import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../packages/kit/src/hooks/design-guard-stop.js', import.meta.url))

function runHook(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const stopInput = (cwd, over = {}) =>
  JSON.stringify({ hook_event_name: 'Stop', cwd, ...over })

function armDesignPack(cwd) {
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ recipe: 'shadcn-tailwind-external-kit' }))
}

function writeGuardState(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 1, lastWriteAt: Date.now(), ...over }))
}

function writeAuditReceipt(cwd, over = {}) {
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(
    join(cwd, 'design', 'audit-receipt.json'),
    JSON.stringify({ timestamp: Date.now(), componentNames: ['Button'], violationCount: 0, writeCounterAtAudit: 1, ...over }),
  )
}

describe('design-guard-stop — blocks Stop/SubagentStop on stale/missing audit receipts', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designguard-stop-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no design/config.json → inert (design pack never installed)', async () => {
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('PASS: armed but no writes ever recorded → nothing owed', async () => {
    armDesignPack(cwd)
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK: writes recorded with no audit receipt at all', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  it('PASS: clean receipt matching the current write counter', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    writeAuditReceipt(cwd)
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK: receipt has outstanding violations', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    writeAuditReceipt(cwd, { violationCount: 3 })
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/violation/)
  })

  it('BLOCK: a new write happened after the last clean audit (stale writeCounterAtAudit)', async () => {
    armDesignPack(cwd)
    writeAuditReceipt(cwd, { writeCounterAtAudit: 1 })
    writeGuardState(cwd, { writeCount: 2 })
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/after the last clean audit/)
  })

  it('BLOCK: SubagentStop is gated identically to Stop', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    const r = await runHook(stopInput(cwd, { hook_event_name: 'SubagentStop' }))
    expect(r.code).toBe(2)
  })

  it('PASS: malformed hook stdin → inert', async () => {
    expect((await runHook('not json')).code).toBe(0)
  })
})
