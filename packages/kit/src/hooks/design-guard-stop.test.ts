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

// Per-session gate state under `.argo/` (per-session-design-gate.md).
function writeSessionState(cwd: string, sessionId: string, writeCount: number) {
  mkdirSync(join(cwd, '.argo', 'design-guard'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'design-guard', `${sessionId}.json`), JSON.stringify({ writeCount, lastWriteAt: Date.now() }))
}

function writeSessionReceipt(
  cwd: string,
  sessionId: string,
  { writeCountAtAudit, apps = { '.': { componentNames: ['Button'], violationCount: 0 } } }: { writeCountAtAudit: number; apps?: Record<string, { componentNames: string[]; violationCount: number }> }
) {
  mkdirSync(join(cwd, '.argo', 'audit-receipts'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'audit-receipts', `${sessionId}.json`), JSON.stringify({ timestamp: Date.now(), writeCountAtAudit, apps }))
}

function writePendingAck(cwd: string, sessionId: string, { reason = 'deferring to a follow-up', writeCountAtAck }: { reason?: string; writeCountAtAck: number }) {
  mkdirSync(join(cwd, '.argo', 'pending-ack'), { recursive: true })
  writeFileSync(join(cwd, '.argo', 'pending-ack', `${sessionId}.json`), JSON.stringify({ reason, ackedAt: Date.now(), writeCountAtAck }))
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
    armDesignPackMonorepo(cwd, 'apps/web')
    writeGuardState(cwd)
    writeAppAuditReceipt(cwd, 'apps/web')
    expect((await runHook(stopInput(cwd))).code).toBe(0)
  })

  it('BLOCK (monorepo): a receipt at the OLD repo-root path is not consulted, app-root receipt still missing', async () => {
    armDesignPackMonorepo(cwd, 'apps/web')
    writeGuardState(cwd)
    writeAuditReceipt(cwd) // old, wrong location: <repoRoot>/design/audit-receipt.json
    const r = await runHook(stopInput(cwd))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  // --- Per-session path (per-session-design-gate.md) ------------------------
  // Every session is judged ONLY by its own `.argo/design-guard/<sid>.json`
  // (write count) + `.argo/audit-receipts/<sid>.json` (audit result). No shared
  // state to race, no cross-session hostage.
  it('PASS: a session with no writes of its own is a bystander, whatever any other session did', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'other', 4) // a concurrent session wrote a lot
    writeGuardState(cwd, { writeCount: 9 }) // and a stale legacy shared counter exists
    const r = await runHook(stopInput(cwd, { session_id: 'bystander' }))
    expect(r.code).toBe(0)
  })

  it('BLOCK: a session that recorded writes but has no receipt is gated on its own state', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 2)
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  it('PASS: this session fully audited, even while another session keeps writing (no shared-counter deadlock)', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 3)
    writeSessionState(cwd, 'other', 99) // concurrent writer races ahead — invisible to mine
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 3 })
    expect((await runHook(stopInput(cwd, { session_id: 'mine' }))).code).toBe(0)
  })

  // P4b completeness must-exist gate (existence only).
  function writeCompletenessState(cwd: string, sessionId: string, screens: Record<string, { composedAt: number; recordedAt: number | null }>) {
    mkdirSync(join(cwd, '.argo', 'completeness'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'completeness', `${sessionId}.json`), JSON.stringify({ screens }))
  }

  it('BLOCK: a composed screen whose completeness check never ran (audit otherwise clean)', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 2)
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 2 })
    writeCompletenessState(cwd, 'mine', { 'first-run': { composedAt: 1, recordedAt: null } })
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/without running the completeness check: first-run/)
  })

  it('PASS: composed screen with its completeness check recorded (content not inspected)', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 2)
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 2 })
    writeCompletenessState(cwd, 'mine', { 'first-run': { composedAt: 1, recordedAt: 2 } })
    expect((await runHook(stopInput(cwd, { session_id: 'mine' }))).code).toBe(0)
  })

  it('BLOCK: this session wrote again after its own audit (live count ahead of receipt)', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 4)
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 3 })
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/after the last clean audit/)
  })

  it('BLOCK: this session\'s receipt is current but carries outstanding violations', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 2)
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 2, apps: { '.': { componentNames: ['Button'], violationCount: 3 } } })
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/violation/)
  })

  it('BLOCK (monorepo): session wrote but its receipt has no entry for a configured app', async () => {
    armDesignPackMonorepo(cwd, 'apps/web')
    writeSessionState(cwd, 'mine', 1)
    writeSessionReceipt(cwd, 'mine', { writeCountAtAudit: 1, apps: {} }) // no apps/web entry
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit/)
  })

  it('BLOCK: missing session_id falls back to default-deny on the legacy global counter', async () => {
    armDesignPack(cwd)
    writeGuardState(cwd) // legacy sessionless writes recorded, no receipt
    const r = await runHook(stopInput(cwd)) // no session_id at all
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })

  // Slice 14: "park with acknowledged pending work" affordance — a stop-gate
  // escape hatch, checked before the normal receipt/violation blocking logic.
  it('PASS: a valid ack at the current write count exits 0 with no receipt present', async () => {
    armDesignPack(cwd)
    writeSessionState(cwd, 'mine', 2)
    writePendingAck(cwd, 'mine', { writeCountAtAck: 2 })
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(0)
  })

  it('BLOCK: an ack recorded BEFORE a subsequent write (stale) still blocks', async () => {
    armDesignPack(cwd)
    writePendingAck(cwd, 'mine', { writeCountAtAck: 1 }) // acked at write count 1
    writeSessionState(cwd, 'mine', 2) // then wrote again, past the ack
    const r = await runHook(stopInput(cwd, { session_id: 'mine' }))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no audit receipt/)
  })
})
