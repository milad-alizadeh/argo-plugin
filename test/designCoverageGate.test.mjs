import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCoverageReceipt } from '../packages/kit/src/hooks/design-coverage-gate.js'

describe('evaluateCoverageReceipt (design-coverage-gate.mjs decision predicate)', () => {
  it('passes a clean, fresh, non-compose receipt matching the contract figmaFileVersion', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result).toEqual({ ok: true })
  })

  it('rejects a receipt produced by "compose" (P4 self-check is advisory-only, never the receipt of record)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'compose', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt that is not clean (UNACCOUNTED or MISSING regions present)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: false }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt whose figmaFileVersion disagrees with the current contract (stale against its own source)', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '41', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a receipt older than the staleness window', () => {
    const receipt = { screen: 'cockpit-shell', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 0, clean: true }

    const result = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion: '42', now: 11 * 60 * 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects when there is no receipt at all', () => {
    const result = evaluateCoverageReceipt(null, { contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })

  it('rejects a stale receipt from a DIFFERENT screen than the one being committed (C2: top silent-failure risk)', () => {
    const receipt = { screen: 'other-screen', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: 1000, clean: true }

    const result = evaluateCoverageReceipt(receipt, { expectedScreen: 'cockpit-shell', contractFigmaFileVersion: '42', now: 1000 })

    expect(result.ok).toBe(false)
  })
})

// ————— wired integration path (checkpoint-review finding): the hook binary’s
// per-app argo.json arming + C2 screen derivation, spawned like the real hook —————

const GATE = fileURLToPath(new URL('../packages/kit/src/hooks/design-coverage-gate.js', import.meta.url))

function runGate(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const commitInput = (cwd, command = 'git commit -m "feat: screen"') =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

function writeArgoJson(repo, design) {
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(join(repo, '.claude', 'argo.json'), JSON.stringify({ design }))
}

/** Stage a component file + the screen's contract inside `appRoot`, and write the frozen contract. */
function stageScreenWork(repo, appRoot, screen, { figmaFileVersion = '42' } = {}) {
  mkdirSync(join(repo, appRoot, 'src', 'components'), { recursive: true })
  writeFileSync(join(repo, appRoot, 'src', 'components', 'Shell.tsx'), 'export const Shell = () => null')
  mkdirSync(join(repo, appRoot, 'design', 'contracts'), { recursive: true })
  writeFileSync(
    join(repo, appRoot, 'design', 'contracts', `${screen}.json`),
    JSON.stringify({ screen, figmaFileVersion, regions: [] }),
  )
  execFileSync('git', ['-C', repo, 'add', '.'])
}

function writeCoverageReceipt(repo, appRoot, screen, overrides = {}) {
  writeFileSync(
    join(repo, appRoot, 'design', `coverage-receipt-${screen}.json`),
    JSON.stringify({
      screen,
      producedBy: 'design-verifier',
      figmaFileVersion: '42',
      timestamp: Date.now(),
      clean: true,
      ...overrides,
    }),
  )
}

describe('design-coverage-gate hook binary — per-app argo.json arming + C2 cross-check (dual-mode)', () => {
  let repo
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'argo-covgate-'))
    execFileSync('git', ['-C', repo, 'init', '-q'])
  })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('PASS: no .claude/argo.json anywhere up the tree → inert', async () => {
    expect((await runGate(commitInput(repo))).code).toBe(0)
  })

  it('monorepo: inert for a sibling app with no design block', async () => {
    writeArgoJson(repo, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })
    stageScreenWork(repo, 'apps/b', 'cockpit')
    expect((await runGate(commitInput(repo))).code).toBe(0)
  })

  it('monorepo BLOCK: armed app with staged component work and no coverage receipt', async () => {
    writeArgoJson(repo, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })
    stageScreenWork(repo, 'apps/a', 'cockpit')
    const r = await runGate(commitInput(repo))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no matching per-screen coverage receipt/)
  })

  it('monorepo PASS: clean, fresh, screen-matched receipt in the ARMED app’s own design dir', async () => {
    writeArgoJson(repo, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })
    stageScreenWork(repo, 'apps/a', 'cockpit')
    writeCoverageReceipt(repo, 'apps/a', 'cockpit')
    expect((await runGate(commitInput(repo))).code).toBe(0)
  })

  it('monorepo BLOCK (C2): receipt names a DIFFERENT screen than the staged contract derives', async () => {
    writeArgoJson(repo, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })
    stageScreenWork(repo, 'apps/a', 'cockpit')
    writeCoverageReceipt(repo, 'apps/a', 'cockpit', { screen: 'other-screen' })
    // the expected-screen receipt file must exist for the gate to reach the cross-check
    writeCoverageReceipt(repo, 'apps/a', 'cockpit')
    const clean = await runGate(commitInput(repo))
    expect(clean.code).toBe(0)

    // now overwrite the expected receipt with one stamped for another screen
    writeFileSync(
      join(repo, 'apps/a', 'design', 'coverage-receipt-cockpit.json'),
      JSON.stringify({ screen: 'other-screen', producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: Date.now(), clean: true }),
    )
    const r = await runGate(commitInput(repo))
    expect(r.code).toBe(2)
  })

  it('single-repo ("." key): arms, blocks without a receipt, passes with one', async () => {
    writeArgoJson(repo, { '.': { root: '.', componentsPath: 'src/components' } })
    stageScreenWork(repo, '.', 'cockpit')
    expect((await runGate(commitInput(repo))).code).toBe(2)
    writeCoverageReceipt(repo, '.', 'cockpit')
    expect((await runGate(commitInput(repo))).code).toBe(0)
  })

  it('one commit spanning TWO design apps: every armed app needs its own receipt', async () => {
    writeArgoJson(repo, {
      'apps/a': { root: 'apps/a', componentsPath: 'src/components' },
      'apps/b': { root: 'apps/b', componentsPath: 'src/components' },
    })
    stageScreenWork(repo, 'apps/a', 'cockpit')
    stageScreenWork(repo, 'apps/b', 'settings')
    writeCoverageReceipt(repo, 'apps/a', 'cockpit')
    // apps/b has no receipt → the commit must still block
    expect((await runGate(commitInput(repo))).code).toBe(2)
    writeCoverageReceipt(repo, 'apps/b', 'settings')
    expect((await runGate(commitInput(repo))).code).toBe(0)
  })
})
