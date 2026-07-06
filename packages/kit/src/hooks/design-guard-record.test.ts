import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Spawned as a real subprocess — dist, not the sibling .ts source. Requires
// `bun run build` to have produced a current packages/kit/dist/.
const HOOK = fileURLToPath(new URL('../../dist/hooks/design-guard-record.js', import.meta.url))

function runHook(stdin: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

const postToolUseInput = (cwd: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__plugin_figma_figma__use_figma',
    tool_input: {},
    cwd,
    ...over,
  })

function armDesignPack(cwd: string) {
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  writeFileSync(
    join(cwd, '.claude', 'argo.json'),
    JSON.stringify({ landing: 'pr', design: { '.': { root: '.', recipe: 'shadcn-tailwind' } } })
  )
}

describe('design-guard-record — PostToolUse on the Figma use_figma tool', () => {
  let cwd: string
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

  // Per-session-design-gate.md: a session's write goes into its OWN file
  // (`.argo/design-guard/<sid>.json`) and touches nothing shared, so two
  // concurrent sessions never race a read-modify-write of one counter.
  it('records a session write into its own per-session file, not the shared counter', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    const s = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'sess-a.json'), 'utf8'))
    expect(s.writeCount).toBe(1)
    expect(typeof s.lastWriteAt).toBe('number')
    // the shared global file is NOT written on the session path (no shared state to race)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('tracks separate sessions in separate files with no shared state between them', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-b' }))
    const a = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'sess-a.json'), 'utf8'))
    const b = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'sess-b.json'), 'utf8'))
    expect(a.writeCount).toBe(2)
    expect(b.writeCount).toBe(1)
  })

  it('a session write leaves a pre-existing legacy shared counter untouched', async () => {
    armDesignPack(cwd)
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 5, lastWriteAt: 1 }))
    await runHook(postToolUseInput(cwd, { session_id: 'sess-a' }))
    const shared = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(shared.writeCount).toBe(5) // untouched — the session path never writes the shared file
    const s = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'sess-a.json'), 'utf8'))
    expect(s.writeCount).toBe(1)
  })

  it('still increments the global counter when session_id is missing, without crashing', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd))
    expect(r.code).toBe(0)
    const state = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8'))
    expect(state.writeCount).toBe(1)
  })
})
