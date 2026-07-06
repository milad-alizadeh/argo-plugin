import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('./block-dangerous-git.sh', import.meta.url))

/** Run the hook as Claude Code does: hook-input JSON on stdin, observe exit code. */
function runHook(stdin, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const bashInput = (command) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })

describe('block-dangerous-git — universal PreToolUse guard on every Bash call', () => {
  it('BLOCK: git reset --hard', async () => {
    const r = await runHook(bashInput('git reset --hard'))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/destructive git command/)
  })

  it('BLOCK: git clean -fd', async () => {
    const r = await runHook(bashInput('git clean -fd'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git branch -D some-branch', async () => {
    const r = await runHook(bashInput('git branch -D some-branch'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git checkout -- .', async () => {
    const r = await runHook(bashInput('git checkout -- .'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git checkout .', async () => {
    const r = await runHook(bashInput('git checkout .'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git restore .', async () => {
    const r = await runHook(bashInput('git restore .'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git push --force', async () => {
    const r = await runHook(bashInput('git push --force origin main'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: git push -f', async () => {
    const r = await runHook(bashInput('git push -f origin main'))
    expect(r.code).toBe(2)
  })

  it('PASS: git status', async () => {
    expect((await runHook(bashInput('git status'))).code).toBe(0)
  })

  it('PASS: git commit -m "reset --hard is mentioned in this message" (words inside a message, not a real command)', async () => {
    expect((await runHook(bashInput('git commit -m "reset --hard is mentioned in this message"'))).code).toBe(0)
  })

  it('PASS: git push origin main (no force flag)', async () => {
    expect((await runHook(bashInput('git push origin main'))).code).toBe(0)
  })

  it('PASS: ls -la (non-git command)', async () => {
    expect((await runHook(bashInput('ls -la'))).code).toBe(0)
  })

  it('PASS: ARGO_DISABLE_GIT_GUARD=1 disables the guard entirely', async () => {
    const r = await runHook(bashInput('git reset --hard'), { ARGO_DISABLE_GIT_GUARD: '1' })
    expect(r.code).toBe(0)
  })

  it('PASS: malformed hook stdin (not JSON) — fail open, does not crash', async () => {
    const r = await runHook('not json at all')
    expect(r.code).toBe(0)
  })

  it('PASS: empty stdin — fail open, does not crash', async () => {
    const r = await runHook('')
    expect(r.code).toBe(0)
  })

  it('PASS: hook JSON with no command field — fail open', async () => {
    const r = await runHook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} }))
    expect(r.code).toBe(0)
  })
})
