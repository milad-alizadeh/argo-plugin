import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(new URL('../hooks/red-proof-gate.mjs', import.meta.url))

function runGate(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

function armBuildMode(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(
    join(cwd, '.argo', 'build-mode.json'),
    JSON.stringify({ plan: 'p.md', slice: 's2', testable: true, requiresLaunch: false, ...over }),
  )
}

function writeProof(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  const testFile = 'sample.spec.ts'
  writeFileSync(join(cwd, testFile), '// spec')
  writeFileSync(
    join(cwd, '.argo', 'red-proof.json'),
    JSON.stringify({ slice: 's2', testFile, redExit: 1, greenExit: 0, recordedAt: Date.now(), ...over }),
  )
}

describe('red-proof gate — commit-scoped, marker-armed, receipts not narration', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-redproof-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))
  const commitInput = (command = 'git commit -m "feat: s2"') =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

  // ── scoping: inert outside a gated build ────────────────────────────────────
  it('PASS: no build-mode marker → inert (normal commits unaffected)', async () => {
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: non-commit command → inert even when armed', async () => {
    armBuildMode(cwd)
    expect((await runGate(commitInput('git status'))).code).toBe(0)
  })

  it('PASS: malformed hook stdin → inert (cannot locate a build to gate)', async () => {
    expect((await runGate('not json')).code).toBe(0)
  })

  // ── the exemption: non-behavioral slices skip red-green, not verify ─────────
  it('PASS: slice marked testable:false needs no red proof (token/config/styling slices)', async () => {
    armBuildMode(cwd, { testable: false })
    expect((await runGate(commitInput())).code).toBe(0)
  })

  // ── green path ───────────────────────────────────────────────────────────────
  it('PASS: well-formed receipt for the current slice (red non-zero, green zero, fresh)', async () => {
    armBuildMode(cwd)
    writeProof(cwd)
    expect((await runGate(commitInput())).code).toBe(0)
  })

  // ── fail closed once armed ───────────────────────────────────────────────────
  it('BLOCK: armed behavioral slice with no receipt at all', async () => {
    armBuildMode(cwd)
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no red-proof receipt/)
  })

  it('BLOCK: receipt names a different slice (no reuse across slices)', async () => {
    armBuildMode(cwd, { slice: 's3' })
    writeProof(cwd) // proof says s2
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: redExit of 0 — the test never failed first (vacuous-test smoking gun)', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { redExit: 0 })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: greenExit non-zero — the test does not actually pass', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { greenExit: 1 })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: receipt points at a test file that does not exist', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { testFile: 'ghost.spec.ts' })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: malformed build-mode marker while armed (default-deny)', async () => {
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'build-mode.json'), '{ nope')
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('regression: receipt predating HEAD must not land a second commit', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { recordedAt: Date.now() - 60_000 })
    // a commit AFTER the receipt was recorded — the receipt already had its commit
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    execFileSync('git', ['-C', cwd, 'add', '.'], {})
    execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'])
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/predates HEAD/)
  })
})
