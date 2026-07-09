import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Spawned as a real subprocess, so it must run compiled JS — dist, not the
// sibling .ts source (Node has no TS loader here). Requires `bun run build`
// to have produced a current packages/kit/dist/ before this test runs.
const GATE = fileURLToPath(new URL('../../../dist/packs/design/design-commit-gate.js', import.meta.url))

function runGate(stdin: string) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const commitInput = (cwd: string, command = 'git commit -m "feat: component"') =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

function writeArgoJson(repo: string, design: unknown) {
  mkdirSync(join(repo, '.argo'), { recursive: true })
  writeFileSync(join(repo, '.argo', 'config.json'), JSON.stringify({ design }))
}

function stageComponent(repo: string, appRoot: string) {
  execFileSync('git', ['-C', repo, 'init', '-q'])
  const dir = join(repo, appRoot, 'src', 'components')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'Button.tsx'), 'export const Button = () => null')
  execFileSync('git', ['-C', repo, 'add', '.'])
}

describe('design-commit-gate — armed per-app by .argo/config.json design blocks (decision 8), not build-mode.json', () => {
  let cwd: string
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designcommit-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no .argo/config.json anywhere up the tree → inert', async () => {
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('PASS: non-commit command → inert even when armed', async () => {
    writeArgoJson(cwd, { '.': { root: '.', componentsPath: 'src/components' } })
    expect((await runGate(commitInput(cwd, 'git status'))).code).toBe(0)
  })

  it('BLOCK: staged file under componentsPath with no spec-diff receipt at all', async () => {
    writeArgoJson(cwd, { '.': { root: '.', componentsPath: 'src/components' } })
    stageComponent(cwd, '.')
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no spec-diff receipt/)
  })

  it('PASS: staged file under componentsPath with a fresh, passing spec-diff receipt', async () => {
    writeArgoJson(cwd, { '.': { root: '.', componentsPath: 'src/components' } })
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: Date.now(), exitCode: 0 }))
    stageComponent(cwd, '.')
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('BLOCK: spec-diff receipt exists but exitCode is non-zero (drift found)', async () => {
    writeArgoJson(cwd, { '.': { root: '.', componentsPath: 'src/components' } })
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: Date.now(), exitCode: 1 }))
    stageComponent(cwd, '.')
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/exited non-zero/)
  })

  it('BLOCK: spec-diff receipt is stale (recorded long before this commit)', async () => {
    writeArgoJson(cwd, { '.': { root: '.', componentsPath: 'src/components' } })
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'spec-diff-receipt.json'),
      JSON.stringify({ recordedAt: Date.now() - 30 * 60 * 1000, exitCode: 0 }),
    )
    stageComponent(cwd, '.')
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/timestamp out of range/)
  })

  it('monorepo: arms for the configured app (receipt read from ITS design dir), inert for the sibling', async () => {
    writeArgoJson(cwd, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })

    // staged file in apps/b (no design block) → inert even with no receipt anywhere
    stageComponent(cwd, 'apps/b')
    expect((await runGate(commitInput(cwd))).code).toBe(0)

    // staged file in apps/a → armed, blocks without a receipt in apps/a/design/
    stageComponent(cwd, 'apps/a')
    const blocked = await runGate(commitInput(cwd))
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toMatch(/apps\/a/)

    // fresh passing receipt in apps/a/design/ → passes
    mkdirSync(join(cwd, 'apps/a', 'design'), { recursive: true })
    writeFileSync(join(cwd, 'apps/a', 'design', 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: Date.now(), exitCode: 0 }))
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('monorepo: gate arms from a nested cwd inside the repo (walk-up resolution)', async () => {
    writeArgoJson(cwd, { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } })
    stageComponent(cwd, 'apps/a')
    const nested = join(cwd, 'apps', 'a')
    const r = await runGate(commitInput(nested))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no spec-diff receipt/)
  })
})
