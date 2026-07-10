import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Fail-closed acid test for the hooks.json kit wiring, post bootstrap-deadlock
 * fix: every kit GATE line dispatches through hooks/toolkit-dispatch.mjs (never a
 * raw npx one-liner — that fails closed on ANY npx failure and deadlocks the
 * `bun install` that would install the kit). The dispatcher itself must:
 *   - BLOCK (exit 2) for an ARMED project (declares @argohq/toolkit) with the kit
 *     missing — dead gates never silently pass a gated command through
 *   - ALLOW (exit 0, one-line warning) for a project that is not
 *     argo-initialized, so it can still self-initialize
 */

const HOOKS_DIR = dirname(fileURLToPath(new URL('./hooks.json', import.meta.url)))
const PLUGIN_ROOT = dirname(HOOKS_DIR)

function allCommands(hooksJson) {
  const out = []
  for (const event of Object.values(hooksJson.hooks)) {
    for (const entry of event) {
      for (const h of entry.hooks) out.push(h.command)
    }
  }
  return out
}

const hooksJson = JSON.parse(readFileSync(join(HOOKS_DIR, 'hooks.json'), 'utf8'))
const kitWrappers = allCommands(hooksJson).filter((c) => c.includes('toolkit-dispatch.mjs'))
const bashWrapper = kitWrappers.find((c) => c.includes('bash-pretooluse'))

let armed
let unarmed

beforeAll(() => {
  // ARMED: declares @argohq/toolkit but never ran bun install.
  armed = mkdtempSync(join(tmpdir(), 'argo-fail-closed-armed-'))
  writeFileSync(
    join(armed, 'package.json'),
    JSON.stringify({ name: 'armed-host', devDependencies: { '@argohq/toolkit': '^0.1.1' } })
  )
  // UNARMED: plugin enabled but the project was never argo-initialized.
  unarmed = mkdtempSync(join(tmpdir(), 'argo-fail-closed-unarmed-'))
  mkdirSync(unarmed, { recursive: true })
})

afterAll(() => {
  rmSync(armed, { recursive: true, force: true })
  rmSync(unarmed, { recursive: true, force: true })
})

function runWrapper(command, cwd, toolCommand) {
  return spawnSync('bash', ['-c', command], {
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: toolCommand },
      cwd,
    }),
    encoding: 'utf8',
    timeout: 60_000,
  })
}

describe('fail-closed hook wrappers', () => {
  it('hooks.json routes every toolkit gate through the toolkit-dispatch dispatcher, never raw npx', () => {
    expect(bashWrapper, 'no toolkit-dispatch bash-pretooluse wrapper found in hooks.json').toBeTruthy()
    expect(kitWrappers.length).toBeGreaterThanOrEqual(3) // bash-pretooluse, post-edit-write, playbook-permission (design-guard retired, Slice 13)
    for (const cmd of allCommands(hooksJson)) {
      expect(cmd, `raw npx kit wrapper survives in hooks.json: ${cmd}`).not.toContain('npx')
    }
    for (const cmd of kitWrappers) {
      expect(cmd).toContain('${CLAUDE_PLUGIN_ROOT}/hooks/toolkit-dispatch.mjs')
    }
  })

  it('ARMED project, kit missing: blocks (exit 2) a gated command with an actionable message', () => {
    const res = runWrapper(bashWrapper, armed, 'git commit -m "sneak past dead gates"')
    expect(res.status).toBe(2)
    expect(res.stderr).toMatch(/bun install/)
  })

  it('UNARMED project: allows bootstrap (`bun install` exits 0) instead of deadlocking', () => {
    const res = runWrapper(bashWrapper, unarmed, 'bun install')
    expect(res.status).toBe(0)
  })
})
