import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(new URL('../hooks/design-commit-gate.mjs', import.meta.url))

function runGate(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const commitInput = (cwd, command = 'git commit -m "feat: component"') =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

describe('design-commit-gate — commit-scoped, armed by design/config.json alone (not build-mode.json)', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designcommit-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no design/config.json → inert (design pack never installed)', async () => {
    expect((await runGate(commitInput(cwd))).code).toBe(0)
  })

  it('PASS: non-commit command → inert even when armed', async () => {
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ componentsPath: 'src/components' }))
    expect((await runGate(commitInput(cwd, 'git status'))).code).toBe(0)
  })

  it('BLOCK: staged file under componentsPath with no spec-diff receipt at all', async () => {
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ componentsPath: 'src/components' }))
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    mkdirSync(join(cwd, 'src', 'components'), { recursive: true })
    writeFileSync(join(cwd, 'src', 'components', 'Button.tsx'), 'export const Button = () => null')
    execFileSync('git', ['-C', cwd, 'add', 'src/components/Button.tsx'])
    const r = await runGate(commitInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no spec-diff receipt/)
  })
})
