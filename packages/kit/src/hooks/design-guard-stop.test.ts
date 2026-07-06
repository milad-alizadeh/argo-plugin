import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Spawned as a real subprocess — dist, not the sibling .ts source. Requires
// `bun run build` to have produced a current packages/kit/dist/.
const HOOK = fileURLToPath(new URL('../../dist/hooks/design-guard-stop.js', import.meta.url))

function runHook(stdin: string) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const stopInput = (cwd: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ hook_event_name: 'Stop', cwd, ...over })

function armDesignPack(cwd: string) {
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  writeFileSync(
    join(cwd, '.claude', 'argo.json'),
    JSON.stringify({ landing: 'pr', design: { '.': { root: '.', recipe: 'shadcn-tailwind' } } })
  )
}

function writeGuardState(cwd: string, over: Record<string, unknown> = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 1, lastWriteAt: Date.now(), ...over }))
}

function writeAuditReceipt(cwd: string, over: Record<string, unknown> = {}) {
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(
    join(cwd, 'design', 'audit-receipt.json'),
    JSON.stringify({ timestamp: Date.now(), componentNames: ['Button'], violationCount: 0, writeCounterAtAudit: 1, ...over }),
  )
}

function armDesignPackMonorepo(cwd: string, appRoot: string) {
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  writeFileSync(
    join(cwd, '.claude', 'argo.json'),
    JSON.stringify({ landing: 'pr', design: { [appRoot]: { root: appRoot, recipe: 'shadcn-tailwind' } } })
  )
}

function writeAppAuditReceipt(cwd: string, appRoot: string, over: Record<string, unknown> = {}) {
  mkdirSync(join(cwd, appRoot, 'design'), { recursive: true })
  writeFileSync(
    join(cwd, appRoot, 'design', 'audit-receipt.json'),
    JSON.stringify({ timestamp: Date.now(), componentNames: ['Button'], violationCount: 0, writeCounterAtAudit: 1, ...over }),
  )
}

describe('design-guard-stop — blocks Stop/SubagentStop on stale/missing audit receipts', () => {
  let cwd: string
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-designguard-stop-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))

  it('PASS: no set-up design.<app> block in .claude/argo.json → inert (design pack never installed)', async () => {
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('PASS: a legacy design/config.json alone does not arm it (no-legacy ruling)', async () => {
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'config.json'), JSON.stringify({ recipe: 'shadcn-tailwind' }))
    writeGuardState(cwd) // even with writes recorded, an un-set-up project never blocks
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('PASS: armed but no writes ever recorded → nothing owed', async () => {
    armDesignPack(cwd)
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK: writes recorded with no audit receipt at all', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  it('PASS: clean receipt matching the current write counter', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    writeAuditReceipt(cwd)
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK: receipt has outstanding violations', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    writeAuditReceipt(cwd, { violationCount: 3 })
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/violation/)
  })

  it('BLOCK: a new write happened after the last clean audit (stale writeCounterAtAudit)', async () => {
    armDesignPack(cwd)
    writeAuditReceipt(cwd, { writeCounterAtAudit: 1 })
    writeGuardState(cwd, { writeCount: 2 })
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/after the last clean audit/)
  })

  it('BLOCK: SubagentStop is gated identically to Stop', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd)
    const r = await runHook(stopInput(cwd, { hook_event_name: 'SubagentStop' }))
    expect(r.code).toBe(2)
  })

  it('PASS: stale write counter defers rather than blocks while a background subagent is still in flight', async () => {
    armDesignPack(cwd)
    writeAuditReceipt(cwd, { writeCounterAtAudit: 1 })
    writeGuardState(cwd, { writeCount: 2 })
    const r = await runHook(
      stopInput(cwd, { background_tasks: [{ id: 'a1', type: 'subagent', status: 'running', description: 'designer fan-out', agent_type: 'designer' }] })
    )
    expect(r.code).toBe(0)
  })

  it('BLOCK: once background work clears, the same stale counter blocks again', async () => {
    armDesignPack(cwd)
    writeAuditReceipt(cwd, { writeCounterAtAudit: 1 })
    writeGuardState(cwd, { writeCount: 2 })
    const r = await runHook(stopInput(cwd, { background_tasks: [] }))
    expect(r.code).toBe(2)
  })

  it('PASS: malformed hook stdin → inert', async () => {
    expect((await runHook('not json')).code).toBe(0)
  })

  it('PASS (monorepo): a clean receipt at <app.root>/design/audit-receipt.json satisfies the guard', async () => {
    armDesignPackMonorepo(cwd, 'apps/desktop')
    writeGuardState(cwd)
    writeAppAuditReceipt(cwd, 'apps/desktop')
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK (monorepo): a receipt at the OLD repo-root path is not consulted, app-root receipt still missing', async () => {
    armDesignPackMonorepo(cwd, 'apps/desktop')
    writeGuardState(cwd)
    writeAuditReceipt(cwd) // old, wrong location: <repoRoot>/design/audit-receipt.json
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  it('PASS: a bystander session with zero recorded writes is not blocked by another session\'s global writeCount', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd, { sessions: { 'other-session': { writeCount: 1, lastWriteAt: Date.now() } } })
    // no receipt exists at all, and global writeCount > 0 — would block under the old global-only logic
    const r = await runHook(stopInput(cwd, { session_id: 'bystander-session' }))
    expect(r.code).toBe(0)
  })

  it('BLOCK: a session that DID record writes is still gated on its own missing/stale receipt', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd, { sessions: { 'writer-session': { writeCount: 1, lastWriteAt: Date.now() } } })
    const r = await runHook(stopInput(cwd, { session_id: 'writer-session' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  it('BLOCK: missing session_id falls back to default-deny on the global counter (no free pass)', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd, { sessions: { 'some-other-session': { writeCount: 1, lastWriteAt: Date.now() } } })
    const r = await runHook(stopInput(cwd)) // no session_id at all
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })
})
