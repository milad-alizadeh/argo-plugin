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

function armBuildMode(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(
    join(cwd, '.argo', 'build-mode.json'),
    JSON.stringify({ plan: 'p.md', slice: 's1', testable: true, requiresLaunch: true, ...over }),
  )
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

describe('trust gate (§8.2) — commit-scoped, marker-armed, fails closed when armed', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-gate-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))
  const commitInput = (command = 'git commit -m "feat: slice"') =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

  // ── SCOPING: inert outside a gated build ────────────────────────────────────
  it('PASS: no build-mode marker → inert, even with no receipt (normal commits unaffected)', async () => {
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: non-commit Bash command → inert even when armed', async () => {
    armBuildMode(cwd)
    expect((await runGate(commitInput('ls -la'))).code).toBe(0)
  })

  it('PASS: armed but slice does not ship launchable behaviour (requiresLaunch:false)', async () => {
    armBuildMode(cwd, { requiresLaunch: false })
    expect((await runGate(commitInput())).code).toBe(0)
  })

  // ── GREEN across ≥2 shapes (§5.3) ──────────────────────────────────────────
  it('PASS: shape-1 (node-web) exercised via MCP report_status', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt())
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: shape-2 (static-cli) exercised via an OSC-777 stop marker', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ shape: 'static-cli', evidence: { osc777: ['argo;stop;/tmp/x'], mcpStatuses: [] } }))
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: receipt found one workspace level down (apps/<ws>/.argo) — monorepo launch cwd', async () => {
    armBuildMode(cwd)
    const ws = join(cwd, 'apps', 'desktop')
    mkdirSync(join(ws, '.argo'), { recursive: true })
    writeFileSync(join(ws, '.argo', 'launch-receipt.json'), greenReceipt())
    expect((await runGate(commitInput())).code).toBe(0)
  })

  // ── RED: the acid test — a builder that skips the launch goes RED ──────────
  it('regression: trust-gate must go RED when launch is skipped (no receipt)', async () => {
    armBuildMode(cwd)
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: launched but never exercised (exercised:false)', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ exercised: false, evidence: { osc777: [], mcpStatuses: [] } }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: half-run (exitCode:null still running) must not pass', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ exitCode: null }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: non-zero exit', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ exitCode: 1 }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: stale receipt (started long ago)', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ startedAt: NOW - 30 * 60 * 1000 }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('regression: gate must go RED on a future-dated receipt (negative age fail-open)', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, greenReceipt({ startedAt: NOW + 999_999_999 }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  // ── default-deny once armed: malformed anything → BLOCK ────────────────────
  it('BLOCK: unparseable receipt JSON (default-deny)', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, '{ not valid json')
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: unparseable build-mode marker while armed (default-deny)', async () => {
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'build-mode.json'), '{ nope')
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  it('BLOCK: receipt missing required fields (default-deny)', async () => {
    armBuildMode(cwd)
    writeReceipt(cwd, JSON.stringify({ sessionId: 'x' }))
    expect((await runGate(commitInput())).code).not.toBe(0)
  })

  // Malformed stdin can't identify a cwd to scope by → inert (this hook runs on EVERY
  // Bash call in EVERY host project; blocking all of them on a glitch would make the
  // plugin all-blocking, the failure mode the gates are scoped to avoid).
  it('PASS: malformed hook stdin → inert (cannot even locate a build to gate)', async () => {
    expect((await runGate('}{ not json')).code).toBe(0)
  })
})
