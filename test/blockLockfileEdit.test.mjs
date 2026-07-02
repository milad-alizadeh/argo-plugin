import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../hooks/block-lockfile-edit.mjs', import.meta.url))

/** Run the hook as Claude Code does: hook-input JSON on stdin, observe exit code. */
function runHook(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const editInput = (tool_name, file_path) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input: { file_path } })

describe('block-lockfile-edit — never hand-edit a lockfile, use the package manager', () => {
  it('BLOCK: Write to bun.lock', async () => {
    const r = await runHook(editInput('Write', '/repo/bun.lock'))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/package manager/)
  })

  it('BLOCK: Edit to package-lock.json', async () => {
    expect((await runHook(editInput('Edit', '/some/project/package-lock.json'))).code).toBe(2)
  })

  it('BLOCK: bun.lockb — the suffix-match branch, distinct from exact-name lookup', async () => {
    expect((await runHook(editInput('Edit', '/some/project/bun.lockb'))).code).toBe(2)
  })

  it('PASS: package.json, source files, and near-miss names are untouched', async () => {
    for (const path of ['/repo/package.json', '/repo/src/index.ts', '/repo/Cargo.toml', '/repo/locker.ts']) {
      expect((await runHook(editInput('Write', path))).code).toBe(0)
    }
  })

  it('PASS: malformed stdin / missing file_path — fail open, never crashes', async () => {
    for (const stdin of ['not json', '', JSON.stringify({ tool_input: {} })]) {
      expect((await runHook(stdin)).code).toBe(0)
    }
  })
})
