import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('./design-guard-record.js', import.meta.url))

function runHook(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

const postToolUseInput = (cwd, over = {}) =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__plugin_figma_figma__use_figma',
    tool_input: {},
    cwd,
    ...over,
  })

function armDesignPack(cwd) {
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ recipe: 'shadcn-tailwind-external-kit' }))
}

describe('design-guard-record — PostToolUse on the Figma use_figma tool', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designguard-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no design/config.json → inert (design pack never installed)', async () => {
    const r = await runHook(postToolUseInput(cwd))
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('records a write and increments the counter on a fresh state file', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd))
    expect(r.code).toBe(0)
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(1)
    expect(typeof state.lastWriteAt).toBe('number')
  })

  it('increments the counter on subsequent writes rather than resetting it', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd))
    await runHook(postToolUseInput(cwd))
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(2)
  })

  it('injects additionalContext reminding a clean tier-0 audit receipt is owed', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd))
    const out = JSON.parse(r.stdout)
    expect(out.hookSpecificOutput.additionalContext).toMatch(/audit/i)
  })

  it('PASS: a different tool name is inert even when armed', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd, { tool_name: 'Bash' }))
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('PASS: malformed hook stdin → inert', async () => {
    expect((await runHook('not json')).code).toBe(0)
  })
})
