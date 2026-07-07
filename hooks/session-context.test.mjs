import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = fileURLToPath(new URL('./session-context.mjs', import.meta.url))

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
    // Stack specifics belong to init's installed rules, never this card.
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

describe('session-context — setup lifecycle nudges', () => {
  it('nudges to run /argo:init when the project has no .claude/argo.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:init')
      expect(context).toMatch(/not set up|isn't set up/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats a legacy argo-config.json as NOT set up (no-legacy ruling: rip-and-re-init, no migration)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(join(dir, '.claude', 'argo-config.json'), JSON.stringify({ landing: 'merge' }))
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:init')
      expect(context).toMatch(/not set up|isn't set up/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays silent (no SETUP nudge) once .claude/argo.json exists — no version comparison', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(join(dir, '.claude', 'argo.json'), JSON.stringify({ landing: 'merge' }))
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('SETUP:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('session-context — no version/migration nudges (setup-version machinery removed)', () => {
  it('never nudges /argo:setup-design for a set-up design.<app> block (design version nudges are gone)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(
        join(dir, '.claude', 'argo.json'),
        JSON.stringify({ landing: 'pr', design: { '.': { root: '.', recipe: 'shadcn-tailwind' } } })
      )
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('/argo:setup-design')
      expect(context).not.toContain('SETUP:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
