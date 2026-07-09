import { setActiveInstance, writeInstance } from '@argohq/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Spawned as a real subprocess — dist, not the sibling .ts source. Requires
// `bun run build` to have produced a current packages/kit/dist/, and
// `@argohq/core`/`@argohq/adapter-claude` to be built + installed as
// workspace deps (same convention as trust-gate.test.ts's dist requirement).
const GATE = fileURLToPath(new URL('../../dist/hooks/workflow-permission-gate.js', import.meta.url))

/** Run the gate as the real hook does: hook-input JSON on stdin, observe exit
 * code + stderr. `ARGO_STATE_ROOT` is this module's test-only seam (see the
 * gate's own doc comment) so the state store never touches a real home dir. */
function runGate(stdin: string, stateRoot: string) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise) => {
    const child = spawn('node', [GATE], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolvePromise({ code, stderr }))
    child.stdin.end(stdin)
  })
}

describe('workflow permission gate — kit-side wiring over @argohq/adapter-claude', () => {
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
    // workflow/stage, so an unregistered/fabricated workflow name here still
    // proves the ordering (this instance's "allows" would include
    // "file-edit" were its spec real).
    writeInstance(
      'fake-workflow--fixture',
      {
        workflow: 'fake-workflow-that-allows-file-edit',
        target: 'fixture',
        stage: 'build',
        status: 'in-progress',
        attempts: [],
        history: []
      },
      { cwd, stateRoot }
    )
    setActiveInstance('fake-workflow--fixture', { cwd, stateRoot })

    const result = await runGate(editInput(join(cwd, '.argo', 'config.json')), stateRoot)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('BLOCK: protected path denied with no active instance at all', async () => {
    const result = await runGate(editInput(join(cwd, 'registry.json')), stateRoot)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('PASS: a non-protected edit with no active instance and default config ("noWorkflow": "allow") passes', async () => {
    const result = await runGate(editInput(join(cwd, 'src', 'App.tsx')), stateRoot)
    expect(result.code).toBe(0)
  })

  it('PASS: malformed hook stdin → inert (mirrors trust-gate/red-proof-gate\'s convention)', async () => {
    const result = await runGate('}{ not json', stateRoot)
    expect(result.code).toBe(0)
  })
})
