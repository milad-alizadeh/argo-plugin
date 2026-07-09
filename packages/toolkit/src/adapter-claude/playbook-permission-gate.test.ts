import { setActiveInstance, writeInstance } from '../core/index.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Spawned as a real subprocess — dist, not the sibling .ts source. Requires
// `bun run build` to have produced a current packages/kit/dist/, and
// `@argohq/core`/`@argohq/claude-adapter-plugin` to be built + installed as
// workspace deps (same convention as trust-gate.test.ts's dist requirement).
const GATE = fileURLToPath(new URL('../../dist/adapter-claude/playbook-permission-gate.js', import.meta.url))

/** Run the gate as the real hook does: hook-input JSON on stdin, observe exit
 * code + stderr. `ARGO_STATE_ROOT` is this module's test-only seam (see the
 * gate's own doc comment) so the state store never touches a real home dir. */
function runGate(stdin: string, stateRoot: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [GATE], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

describe('playbook permission gate — kit-side wiring over @argohq/claude-adapter-plugin', () => {
  let cwd: string
  let stateRoot: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-wf-gate-cwd-'))
    stateRoot = mkdtempSync(join(tmpdir(), 'argo-wf-gate-state-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(stateRoot, { recursive: true, force: true })
  })

  /** Seed `<cwd>/.argo/config.json` with a `noPlaybook` mode fixture. */
  function writeConfig(noPlaybook: string) {
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'config.json'), JSON.stringify({ noPlaybook }))
  }

  const editInput = (filePath: string) =>
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
      cwd
    })

  it('BLOCK: a protected-path Edit is denied EVEN when a fake active instance\'s stage allows "file-edit" (audit 1.1)', async () => {
    // The active instance's spec is never registered — deliberately: the
    // protected-path check runs before the hook ever resolves the instance's
    // playbook/stage, so an unregistered/fabricated playbook name here still
    // proves the ordering (this instance's "allows" would include
    // "file-edit" were its spec real).
    writeInstance(
      'fake-playbook--fixture',
      {
        playbook: 'fake-playbook-that-allows-file-edit',
        target: 'fixture',
        stage: 'build',
        status: 'in-progress',
        attempts: [],
        history: []
      },
      { cwd, stateRoot }
    )
    setActiveInstance('fake-playbook--fixture', { cwd, stateRoot })

    const result = await runGate(editInput(join(cwd, '.argo', 'config.json')), stateRoot)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('BLOCK: protected path denied with no active instance at all', async () => {
    const result = await runGate(editInput(join(cwd, 'registry.json')), stateRoot)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('PASS: a non-protected edit with no active instance and default config ("noPlaybook": "allow") passes', async () => {
    const result = await runGate(editInput(join(cwd, 'src', 'App.tsx')), stateRoot)
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('PASS silent: "noPlaybook": "allow" set explicitly — bare edit passes with no output', async () => {
    writeConfig('allow')
    const result = await runGate(editInput(join(cwd, 'src', 'App.tsx')), stateRoot)
    expect(result.code).toBe(0)
    // stderr is not asserted empty: resolveRepoRoot probes git in the tmpdir
    // fixture (not a repo) and git writes its own noise there. Silence means
    // no stdout — no JSON advisory reaches the model on a plain allow.
    expect(result.stdout).toBe('')
  })

  it('PASS + advise: "noPlaybook": "coach" — bare edit is allowed and advisory context is injected', async () => {
    writeConfig('coach')
    const result = await runGate(editInput(join(cwd, 'src', 'App.tsx')), stateRoot)
    expect(result.code).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
    expect(parsed.hookSpecificOutput.additionalContext).toMatch(/argo playbook start/)
  })

  it('PASS silent: "coach" mode leaves non-edit tool calls untouched', async () => {
    writeConfig('coach')
    const result = await runGate(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: join(cwd, 'src', 'App.tsx') },
        cwd
      }),
      stateRoot
    )
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('BLOCK + coach: "noPlaybook": "deny-edits" — bare edit is denied with the start-a-playbook coaching', async () => {
    writeConfig('deny-edits')
    const result = await runGate(editInput(join(cwd, 'src', 'App.tsx')), stateRoot)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/argo playbook start/)
  })

  it('PASS: malformed hook stdin → inert (mirrors trust-gate/red-proof-gate\'s convention)', async () => {
    const result = await runGate('}{ not json', stateRoot)
    expect(result.code).toBe(0)
  })
})
