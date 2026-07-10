import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Ports the spirit of the retired hooks/fail-closed-hook.test.mjs +
 * hooks/monitor-guard-coverage.test.mjs against the NEW wiring: hooks/hooks.json
 * (repo root) now runs every route through `npx --no-install --offline
 * @argohq/toolkit argo-hook <route>` (no hand-written .mjs in the plugin
 * checkout, no `${CLAUDE_PLUGIN_ROOT}/hooks/*.mjs`), wrapped in `sh -c` so a
 * missing/unresolvable toolkit (npx exit 1) fails OPEN with a warning, while a
 * genuine gate BLOCK (exit 2) still propagates.
 */

// packages/toolkit/src/hooks/ -> repo root is four levels up.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const hooksJson = JSON.parse(readFileSync(join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'))

function allCommands(json: any): string[] {
  const out: string[] = []
  for (const event of Object.values(json.hooks) as any[]) {
    for (const entry of event) {
      for (const h of entry.hooks) out.push(h.command)
    }
  }
  return out
}

function guardsForTool(toolName: string): string[] {
  const out: string[] = []
  for (const entry of hooksJson.hooks.PreToolUse) {
    const matches = entry.matcher === '*' ? true : new RegExp(`^(${entry.matcher})$`).test(toolName)
    if (matches) for (const h of entry.hooks) out.push(h.command)
  }
  return out
}

describe('hooks.json — plugin checkout carries no executable JS', () => {
  it('every command runs the host-installed toolkit via npx --no-install --offline, never a plugin-local script', () => {
    const commands = allCommands(hooksJson)
    expect(commands.length).toBeGreaterThanOrEqual(7)
    for (const cmd of commands) {
      expect(cmd, `command still references plugin-local JS: ${cmd}`).not.toContain('CLAUDE_PLUGIN_ROOT')
      expect(cmd, `command still references a hand-written .mjs: ${cmd}`).not.toMatch(/\.mjs/)
      expect(cmd, `command must never float on @latest: ${cmd}`).not.toContain('@latest')
      expect(cmd).toContain('npx --no-install --offline @argohq/toolkit argo-hook')
    }
  })

  it('every route named in hooks.json is a real argo-hook route (round-trips through the CLI without "unknown event")', () => {
    const ARGO_BIN = join(REPO_ROOT, 'packages', 'toolkit', 'bin', 'argo.js')
    const routes = [...new Set(allCommands(hooksJson).map((c) => /argo-hook (\S+?);/.exec(c)?.[1]).filter(Boolean))]
    expect(routes.length).toBeGreaterThanOrEqual(7)
    for (const route of routes) {
      const res = spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', route as string], {
        input: JSON.stringify({ hook_event_name: 'SessionStart' }),
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(res.stderr, `route "${route}" is unknown to argo-hook`).not.toMatch(/unknown event/)
    }
  })
})

describe('hooks.json — fail-open only when the toolkit is genuinely unresolvable', () => {
  it('a scratch cwd with no @argohq/toolkit install fails OPEN (exit 0) with a warning, offline (no network)', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'argo-hooks-wiring-'))
    try {
      const bashWrapper = guardsForTool('Bash').find((c) => c.includes('argo-hook bash-safety-guards'))
      expect(bashWrapper).toBeTruthy()
      const res = spawnSync('sh', ['-c', bashWrapper as string], {
        cwd: scratch,
        input: JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'git reset --hard' },
          cwd: scratch,
        }),
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(res.status).toBe(0)
      expect(res.stderr).toMatch(/not installed/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('a real gate BLOCK verdict still propagates (exit 2) when the toolkit IS installed', () => {
    const bashSafetyWrapper = guardsForTool('Bash').find((c) => c.includes('argo-hook bash-safety-guards'))
    const res = spawnSync('sh', ['-c', bashSafetyWrapper as string], {
      cwd: REPO_ROOT, // this repo has @argohq/toolkit workspace-linked
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git reset --hard' },
        cwd: REPO_ROOT,
      }),
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(2)
    expect(res.stderr).toMatch(/destructive git command/)
  })

  it('allows a harmless command (exit 0) when the toolkit is installed', () => {
    const bashSafetyWrapper = guardsForTool('Bash').find((c) => c.includes('argo-hook bash-safety-guards'))
    const res = spawnSync('sh', ['-c', bashSafetyWrapper as string], {
      cwd: REPO_ROOT,
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
        cwd: REPO_ROOT,
      }),
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(0)
  })
})

describe('hooks.json — Monitor guard coverage', () => {
  it('the bash-safety-guards route also fires for the Monitor tool (Monitor executes arbitrary shell too)', () => {
    const monitorCmds = guardsForTool('Monitor')
    expect(monitorCmds.some((c) => c.includes('argo-hook bash-safety-guards'))).toBe(true)
  })

  it('blocks a dangerous Monitor command end-to-end', () => {
    const wrapper = guardsForTool('Monitor').find((c) => c.includes('argo-hook bash-safety-guards')) as string
    const res = spawnSync('sh', ['-c', wrapper], {
      cwd: REPO_ROOT,
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Monitor',
        tool_input: { command: 'git reset --hard origin/main', description: 'watching', timeout_ms: 60000, persistent: false },
        cwd: REPO_ROOT,
      }),
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(2)
  })
})
