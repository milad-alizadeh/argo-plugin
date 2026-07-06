import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Spawned as a real subprocess → runs compiled dist, not the .ts source.
// Requires `bun run build` to have produced a current packages/kit/dist/.
const GATE = fileURLToPath(new URL('../../dist/hooks/design-contract-freeze-gate.js', import.meta.url))

function runGate(stdin: string) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const commitInput = (cwd: string, command = 'git commit -m "freeze contract"') =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

function writeArgoJson(repo: string) {
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(join(repo, '.claude', 'argo.json'), JSON.stringify({ design: { '.': { root: '.' } } }))
}

function gitInit(repo: string) {
  execFileSync('git', ['-C', repo, 'init', '-q'])
  execFileSync('git', ['-C', repo, 'config', 'user.email', 't@t'])
  execFileSync('git', ['-C', repo, 'config', 'user.name', 't'])
}

function commitFile(repo: string, relPath: string, content: unknown) {
  const abs = join(repo, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(content))
  execFileSync('git', ['-C', repo, 'add', '.'])
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'freeze'])
}

function stageFile(repo: string, relPath: string, content: unknown) {
  const abs = join(repo, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(content))
  execFileSync('git', ['-C', repo, 'add', relPath])
}

const CONTRACT = 'design/contracts/D01.json'
const base = { screen: 'D01', figmaFileVersion: 'v1', regions: [{ name: 'Stage', kind: 'container' }] }
const driftSameVersion = { screen: 'D01', figmaFileVersion: 'v1', regions: [{ name: 'Stage', kind: 'layout' }] }
const driftBumpedVersion = { screen: 'D01', figmaFileVersion: 'v2', regions: [{ name: 'Stage', kind: 'layout' }] }

describe('design-contract-freeze-gate — blocks a region-set drift committed without a figmaFileVersion bump (C3c)', () => {
  let cwd: string
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-freeze-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no .claude/argo.json anywhere up the tree → inert', async () => {
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('PASS: non-commit command → inert even when a contract is staged', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    stageFile(cwd, CONTRACT, base)
    expect((await runGate(commitInput(cwd, 'git status'))).code).toBe(0)
  })

  it('PASS: no contract staged → inert', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    stageFile(cwd, 'src/components/Button.tsx' as string, {})
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('PASS: first-ever freeze (contract new, no HEAD blob) → nothing to compare against', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    execFileSync('git', ['-C', cwd, 'add', '.'])
    execFileSync('git', ['-C', cwd, 'commit', '-q', '-m', 'init'])
    stageFile(cwd, CONTRACT, base)
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('BLOCK: staged contract regions drift with the SAME figmaFileVersion', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    commitFile(cwd, CONTRACT, base)
    stageFile(cwd, CONTRACT, driftSameVersion)
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/drifted/)
    expect(r.stderr).toMatch(/D01/)
  })

  it('PASS: staged contract regions drift WITH a figmaFileVersion bump', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    commitFile(cwd, CONTRACT, base)
    stageFile(cwd, CONTRACT, driftBumpedVersion)
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('PASS: staged contract identical regions (metadata-only change) → no drift', async () => {
    writeArgoJson(cwd)
    gitInit(cwd)
    commitFile(cwd, CONTRACT, base)
    stageFile(cwd, CONTRACT, { ...base, note: 'unrelated field' })
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('BLOCK: monorepo contract path (apps/desktop/design/contracts/…) is matched and gated', async () => {
    const p = 'apps/desktop/design/contracts/D03.json'
    const b = { screen: 'D03', figmaFileVersion: 'v1', regions: [{ name: 'topbar' }] }
    const d = { screen: 'D03', figmaFileVersion: 'v1', regions: [{ name: 'topbar', kind: 'layout' }] }
    writeArgoJson(cwd)
    gitInit(cwd)
    commitFile(cwd, p, b)
    stageFile(cwd, p, d)
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/D03/)
  })
})
