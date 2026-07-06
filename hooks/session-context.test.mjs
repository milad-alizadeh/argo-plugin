import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
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

  it('nudges to re-run setup when argo.json was written by an older plugin version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(
        join(dir, '.claude', 'argo.json'),
        JSON.stringify({ landing: 'merge', setupVersion: '0.1.0' })
      )
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:init')
      expect(context).toContain('0.1.0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nudges when argo.json predates setup versioning (no setupVersion field)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(join(dir, '.claude', 'argo.json'), JSON.stringify({ landing: 'merge' }))
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:init')
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

  it('stays silent when the setup is current (setupVersion matches the plugin version)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-nudge-'))
    try {
      const { version } = JSON.parse(
        readFileSync(fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url)), 'utf8')
      )
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(
        join(dir, '.claude', 'argo.json'),
        JSON.stringify({ landing: 'merge', setupVersion: version })
      )
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('SETUP:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('session-context — design-pack lifecycle nudge (.claude/argo.json design.<app>)', () => {
  const pluginVersion = () =>
    JSON.parse(readFileSync(fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url)), 'utf8')).version

  const writeArgoJson = (dir, design) => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'argo.json'), JSON.stringify({ landing: 'pr', design }))
  }

  it('stays silent when no design.<app> block carries a recipe (design pack never set up)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      writeArgoJson(dir, { '.': {} }) // init-seeded inert block
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('/argo:setup-design')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats a legacy design/config.json alone as NOT set up (no-legacy ruling — silent)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      mkdirSync(join(dir, 'design'), { recursive: true })
      writeFileSync(join(dir, 'design', 'config.json'), JSON.stringify({ recipe: 'shadcn-tailwind' }))
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('/argo:setup-design')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nudges /argo:setup-design when a design.<app> block has a recipe but predates _meta tracking', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      writeArgoJson(dir, { '.': { root: '.', componentsPath: 'src/components', recipe: 'shadcn-tailwind' } })
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:setup-design')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nudges when a design.<app> _meta.setupVersion is older than the plugin, naming the old version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      writeArgoJson(dir, {
        'apps/a': { root: 'apps/a', recipe: 'shadcn-tailwind', _meta: { setupVersion: '0.1.0', managedFiles: [] } },
      })
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).toContain('/argo:setup-design')
      expect(context).toContain('0.1.0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays silent when every set-up design.<app> _meta.setupVersion matches the plugin version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-dnudge-'))
    try {
      writeArgoJson(dir, {
        '.': { root: '.', recipe: 'shadcn-tailwind', _meta: { setupVersion: pluginVersion(), managedFiles: [] } },
      })
      const r = await runHook(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }))
      const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
      expect(context).not.toContain('/argo:setup-design')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
