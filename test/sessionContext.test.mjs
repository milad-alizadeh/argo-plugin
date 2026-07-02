import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../hooks/session-context.mjs', import.meta.url))

/** Run the hook as Claude Code does: hook-input JSON on stdin, observe exit + stdout. */
function runHook(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

const sessionStartInput = (source = 'startup') =>
  JSON.stringify({ hook_event_name: 'SessionStart', source })

describe('session-context — SessionStart way-of-working card', () => {
  it('emits an additionalContext card on SessionStart, within the 600-token (~2400 char) budget', async () => {
    const r = await runHook(sessionStartInput())
    expect(r.code).toBe(0)
    const out = JSON.parse(r.stdout)
    const context = out.hookSpecificOutput?.additionalContext
    expect(typeof context).toBe('string')
    expect(context.length).toBeGreaterThan(100)
    expect(context.length).toBeLessThanOrEqual(2400)
  })

  it('is a stack-agnostic pointer: routes to argo skills without naming stack tooling', async () => {
    const r = await runHook(sessionStartInput())
    const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
    for (const pointer of ['grill-me', 'build-plan', 'root-cause', 'graphify']) {
      expect(context).toContain(pointer)
    }
    // Stack specifics belong to setup-claude's installed rules, never this card.
    for (const stackWord of ['bun ', 'turbo', 'vitest', 'playwright', 'npm ', 'electron']) {
      expect(context.toLowerCase()).not.toContain(stackWord)
    }
  })

  it('is inert on malformed stdin and on non-SessionStart events (exit 0, no output)', async () => {
    for (const stdin of ['not json', '', JSON.stringify({ hook_event_name: 'PreToolUse' })]) {
      const r = await runHook(stdin)
      expect(r.code).toBe(0)
      expect(r.stdout).toBe('')
    }
  })
})
