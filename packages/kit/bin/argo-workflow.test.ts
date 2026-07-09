import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * End-to-end coverage for workflow-engine-phase1.md's Slice 8 (step 23):
 * `bin/argo.js`'s new `workflow` subcommand (dispatching to @argohq/core's
 * CLI verbs) and the `workflow-permission` entry in `HOOK_CHAINS`
 * (dispatching to @argohq/adapter-claude's PreToolUse hook body via
 * `workflow-permission-gate.js`). Spawns the real `bin/argo.js` — a
 * hand-written launcher that dispatches to `dist/**`, never the sibling .ts
 * source — so this requires `bun run build` before running, same convention
 * as `graph-refresh.test.ts`.
 */
const ARGO_BIN = fileURLToPath(new URL('./argo.js', import.meta.url))

let cwd: string
let stateRoot: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'argo-workflow-cli-cwd-'))
  stateRoot = mkdtempSync(join(tmpdir(), 'argo-workflow-cli-state-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  rmSync(stateRoot, { recursive: true, force: true })
})

describe('argo workflow status — CLI wiring', () => {
  it('on a fresh repo with no instance, reports "not found" (no active workflow)', () => {
    const result = spawnSync(
      process.execPath,
      [ARGO_BIN, 'workflow', 'status', '--key', 'no-such-key', '--host-root', cwd],
      { encoding: 'utf8', env: { ...process.env, ARGO_STATE_ROOT: stateRoot } }
    )

    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toEqual({ found: false, key: 'no-such-key' })
  })
})

describe('argo-hook workflow-permission — HOOK_CHAINS wiring', () => {
  it('denies (exit 2) a protected-path write with a coaching message on stderr', () => {
    const envelope = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(cwd, 'registry.json') },
      cwd
    })

    const result = spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', 'workflow-permission'], {
      input: envelope,
      encoding: 'utf8',
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/protected path/)
  })

  it('allows (exit 0) a non-protected edit with no active workflow and default config', () => {
    const envelope = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(cwd, 'src', 'App.tsx') },
      cwd
    })

    const result = spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', 'workflow-permission'], {
      input: envelope,
      encoding: 'utf8',
      env: { ...process.env, ARGO_STATE_ROOT: stateRoot }
    })

    expect(result.status).toBe(0)
  })
})
