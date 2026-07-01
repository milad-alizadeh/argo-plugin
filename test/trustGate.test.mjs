import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(new URL('../hooks/trust-gate.mjs', import.meta.url))

/** Run the gate as the real hook does: hook-input JSON on stdin, observe exit code. */
function runGate(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

function writeReceipt(cwd, receipt) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'launch-receipt.json'), receipt)
}

const NOW = Date.now()
const greenReceipt = (over = {}) =>
  JSON.stringify({
    sessionId: 'sess-1',
    startedAt: NOW,
    exitCode: 0,
    ptyByteCount: 120,
    exercised: true,
    evidence: { osc777: [], mcpStatuses: ['building the slice'] },
    shape: 'node-web',
    ...over,
  })

describe('trust gate (§8.2) — code-enforced, fails closed', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-gate-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))
  const hookInput = () => JSON.stringify({ hook_event_name: 'Stop', cwd })

  // ── GREEN across ≥2 shapes (§5.3) ──────────────────────────────────────────
  it('PASS: shape-1 (node-web) exercised via MCP report_status', async () => {
    writeReceipt(cwd, greenReceipt())
    expect((await runGate(hookInput())).code).toBe(0)
  })

  it('PASS: shape-2 (static-cli) exercised via an OSC-777 stop marker', async () => {
    writeReceipt(cwd, greenReceipt({ shape: 'static-cli', evidence: { osc777: ['argo;stop;/tmp/x'], mcpStatuses: [] } }))
    expect((await runGate(hookInput())).code).toBe(0)
  })

  // ── RED: the acid test — a builder that skips the launch goes RED ──────────
  it('regression: trust-gate must go RED when launch is skipped (no receipt)', async () => {
    // no receipt written at all
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('BLOCK: launched but never exercised (exercised:false)', async () => {
    writeReceipt(cwd, greenReceipt({ exercised: false, evidence: { osc777: [], mcpStatuses: [] } }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('BLOCK: half-run (exitCode:null still running) must not pass', async () => {
    writeReceipt(cwd, greenReceipt({ exitCode: null }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('BLOCK: non-zero exit', async () => {
    writeReceipt(cwd, greenReceipt({ exitCode: 1 }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('BLOCK: stale receipt (started long ago)', async () => {
    writeReceipt(cwd, greenReceipt({ startedAt: NOW - 30 * 60 * 1000 }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('regression: gate must go RED on a future-dated receipt (negative age fail-open)', async () => {
    writeReceipt(cwd, greenReceipt({ startedAt: NOW + 999_999_999 }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  // ── default-deny: malformed input → BLOCK (opposite of pipe-to-shell hook) ──
  it('BLOCK: unparseable receipt JSON (default-deny)', async () => {
    writeReceipt(cwd, '{ not valid json')
    expect((await runGate(hookInput())).code).not.toBe(0)
  })

  it('BLOCK: malformed hook stdin (default-deny)', async () => {
    expect((await runGate('}{ not json')).code).not.toBe(0)
  })

  it('BLOCK: receipt missing required fields (default-deny)', async () => {
    writeReceipt(cwd, JSON.stringify({ sessionId: 'x' }))
    expect((await runGate(hookInput())).code).not.toBe(0)
  })
})
