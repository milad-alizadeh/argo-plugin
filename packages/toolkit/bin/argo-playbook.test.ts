import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * End-to-end coverage for playbook-engine-phase1.md's Slice 8 (step 23):
 * `bin/argo.js`'s new `playbook` subcommand (dispatching to @argohq/core's
 * CLI verbs) and the `playbook-permission` entry in `HOOK_CHAINS`
 * (dispatching to @argohq/claude-adapter-plugin's PreToolUse hook body via
 * `playbook-permission-gate.js`). Spawns the real `bin/argo.js` — a
 * hand-written launcher that dispatches to `dist/**`, never the sibling .ts
 * source — so this requires `bun run build` before running, same convention
 * as `graph-refresh.test.ts`.
 */
const ARGO_BIN = fileURLToPath(new URL('./argo.js', import.meta.url))

let cwd: string
let stateRoot: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'argo-playbook-cli-cwd-'))
  stateRoot = mkdtempSync(join(tmpdir(), 'argo-playbook-cli-state-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  rmSync(stateRoot, { recursive: true, force: true })
})

describe('argo playbook status — CLI wiring', () => {
  it('on a fresh repo with no instance, reports "not found" (no active playbook)', () => {
    const result = spawnSync(
      process.execPath,
      [ARGO_BIN, 'playbook', 'status', '--key', 'no-such-key', '--host-root', cwd],
      { encoding: 'utf8', env: { ...process.env, ARGO_STATE_ROOT: stateRoot } }
    )

    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toEqual({ found: false, key: 'no-such-key' })
  })
})

describe('argo-hook playbook-permission — HOOK_CHAINS wiring', () => {
  it('denies (exit 2) a protected-path write with a coaching message on stderr', () => {
    const envelope = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(cwd, 'registry.json') },
      cwd
    })

    const result = spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', 'playbook-permission'], {
      input: envelope,
      encoding: 'utf8',
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('allows (exit 0) a non-protected edit with no active playbook and default config', () => {
    const envelope = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(cwd, 'src', 'App.tsx') },
      cwd
    })

    const result = spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', 'playbook-permission'], {
      input: envelope,
      encoding: 'utf8',
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })

    expect(result.status).toBe(0)
  })
})
