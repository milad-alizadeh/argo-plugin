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
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  writeFileSync(
    join(cwd, '.claude', 'argo.json'),
    JSON.stringify({ landing: 'pr', design: { '.': { root: '.', recipe: 'shadcn-tailwind' } } })
  )
}

describe('design-guard-record — PostToolUse on the Figma use_figma tool', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designguard-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no set-up design.<app> block in .claude/argo.json → inert (design pack never installed)', async () => {
    const r = await runHook(postToolUseInput(cwd))
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('PASS: a legacy design/config.json alone does not arm it (no-legacy ruling)', async () => {
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ recipe: 'shadcn-tailwind' }))
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

  it('records a per-session write count alongside the global counter', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(1)
    expect(state.sessions['sess-a'].writeCount).toBe(1)
    expect(typeof state.sessions['sess-a'].lastWriteAt).toBe('number')
  })

  it('tracks separate sessions independently while the global counter sums all of them', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-b' }))
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(3)
    expect(state.sessions['sess-a'].writeCount).toBe(2)
    expect(state.sessions['sess-b'].writeCount).toBe(1)
  })

  it('repairs gracefully when an existing state file predates the sessions map', async () => {
    armDesignPack(cwd)
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 5, lastWriteAt: Date.now() }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(6)
    expect(state.sessions['sess-a'].writeCount).toBe(1)
  })

  it('still increments the global counter when session_id is missing, without crashing', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd))
    expect(r.code).toBe(0)
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(1)
  })
})
