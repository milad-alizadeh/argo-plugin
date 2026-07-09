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

  // Non-project-file exemption: a use_figma call against a file that is not the
  // app's configured projectFileKey (e.g. reading the kit library) must not arm
  // the project's audit gate.
  function armWithProjectFileKey(dir: string, projectFileKey: string) {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'argo.json'),
      JSON.stringify({ design: { '.': { root: '.', recipe: 'shadcn-tailwind', figma: { projectFileKey } } } })
    )
  }

  it('PASS: use_figma against a non-project fileKey (kit library read) does NOT count', async () => {
    armWithProjectFileKey(cwd, 'PROJECT_KEY')
    const r = await runHook(postToolUseInput(cwd, { tool_input: { fileKey: 'KIT_LIBRARY_KEY' } }))
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('COUNTS: use_figma against the configured projectFileKey', async () => {
    armWithProjectFileKey(cwd, 'PROJECT_KEY')
    await runHook(postToolUseInput(cwd, { tool_input: { fileKey: 'PROJECT_KEY' } }))
    expect(JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8')).writeCount).toBe(1)
  })

  it('COUNTS (fail-safe): an absent fileKey still counts when a projectFileKey is configured', async () => {
    armWithProjectFileKey(cwd, 'PROJECT_KEY')
    await runHook(postToolUseInput(cwd, { tool_input: {} }))
    expect(JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8')).writeCount).toBe(1)
  })

  it('COUNTS (fail-safe): no projectFileKey configured → any fileKey counts (old behavior)', async () => {
    armDesignPack(cwd) // no figma.projectFileKey
    await runHook(postToolUseInput(cwd, { tool_input: { fileKey: 'ANY_KEY' } }))
    expect(JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard.json'), 'utf8')).writeCount).toBe(1)
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

  // The removed figma-wireframe exemption tag no longer exempts anything —
  // a write tagged with it counts like any other write.
  it('DOES bump the counter for a write tagged with the removed figma-wireframe tag', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'mixed', tool_input: { skillNames: 'figma-use,figma-wireframe' } }))
    await runHook(postToolUseInput(cwd, { session_id: 'mixed', tool_input: { skillNames: 'figma-use,figma-create' } }))
    const s = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'mixed.json'), 'utf8'))
    expect(s.writeCount).toBe(2) // both writes counted; no wireframe exemption exists
  })

  // Read-only exemption (fidelity-geometry-verifier.md Slice 13, RESOLVED
  // Option A): a pure-introspection
  // use_figma call tags itself `figma-read-only` in `skillNames` so it
  // doesn't arm the audit-owed gate. Trust model: a mistagged write
  // still gets caught by the NEXT real write's count.
  it('does NOT bump the shared counter for a read-only call (skillNames string)', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd, { tool_input: { skillNames: 'figma-use,figma-read-only' } }))
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard.json'))).toBe(false)
  })

  it('does NOT bump the per-session counter for a read-only call (skillNames array)', async () => {
    armDesignPack(cwd)
    const r = await runHook(
      postToolUseInput(cwd, { session_id: 'ro-sess', tool_input: { skillNames: ['figma-use', 'figma-read-only'] } })
    )
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, '.argo', 'design-guard', 'ro-sess.json'))).toBe(false)
  })

  it('does NOT emit the audit-owed nudge for a read-only call', async () => {
    armDesignPack(cwd)
    const r = await runHook(postToolUseInput(cwd, { tool_input: { skillNames: 'figma-read-only' } }))
    expect(r.stdout.trim()).toBe('')
  })

  it('a real write in the same session STILL counts (exemption is per-call, not per-session)', async () => {
    armDesignPack(cwd)
    await runHook(postToolUseInput(cwd, { session_id: 'mixed-ro', tool_input: { skillNames: 'figma-read-only' } }))
    await runHook(postToolUseInput(cwd, { session_id: 'mixed-ro', tool_input: { skillNames: 'figma-use,figma-create' } }))
    const s = JSON.parse(readFileSync(join(cwd, '.argo', 'design-guard', 'mixed-ro.json'), 'utf8'))
    expect(s.writeCount).toBe(1) // only the real write counted; the read-only call did not
  })
})
