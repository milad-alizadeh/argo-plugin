import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Council-mandated fail-closed acid test: with the kit ABSENT (a host project
 * that never ran bun install), the hooks.json wrapper lines must still BLOCK
 * (exit 2) with an actionable message — never silently pass a gated command
 * through dead gates.
 */

const HOOKS_JSON = fileURLToPath(new URL('./hooks.json', import.meta.url))

function allCommands(hooksJson) {
  const out = []
  for (const event of Object.values(hooksJson.hooks)) {
    for (const entry of event) {
      for (const h of entry.hooks) out.push(h.command)
    }
  }
  return out
}

const hooksJson = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'))
const kitWrappers = allCommands(hooksJson).filter((c) => c.includes('argo-hook'))
const bashWrapper = kitWrappers.find((c) => c.includes('argo-hook bash-pretooluse'))

let scratch

beforeAll(() => {
  // A dir with no node_modules anywhere on its ancestry that npx could find the kit in.
  scratch = mkdtempSync(join(tmpdir(), 'argo-fail-closed-'))
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const dangerousCommitInput = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'git commit -m "sneak past dead gates"' },
  cwd: '/tmp',
})

function runWrapper(command) {
  return spawnSync('bash', ['-c', command], {
    cwd: scratch,
    input: dangerousCommitInput,
    encoding: 'utf8',
    timeout: 60_000,
  })
}

describe('fail-closed hook wrappers', () => {
  it('hooks.json routes kit gates through argo-hook with a fail-closed fallback on every wrapper', () => {
    expect(bashWrapper, 'no argo-hook bash-pretooluse wrapper found in hooks.json').toBeTruthy()
    expect(kitWrappers.length).toBeGreaterThanOrEqual(4) // bash-pretooluse, post-edit-write, design-guard-record, design-guard-stop ×2
    for (const cmd of kitWrappers) {
      expect(cmd).toContain("argo gates inactive")
      expect(cmd).toContain('exit 2')
    }
  })

  it('blocks (exit 2, actionable stderr) when the kit is not installed', () => {
    const res = runWrapper(bashWrapper)
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('argo gates inactive')
  })

  it('the fallback is load-bearing: without it the wrapper does NOT produce the fail-closed contract', () => {
    // Strip the `|| { ...; exit 2; }` fallback — the remaining bare npx call must
    // not happen to satisfy the same contract, proving the test exercises the
    // fallback rather than incidental npx exit codes.
    const stripped = bashWrapper.replace(/\s*\|\|\s*\{[^}]*\}\s*$/, '')
    expect(stripped).not.toBe(bashWrapper)
    const res = runWrapper(stripped)
    const failClosedContract = res.status === 2 && res.stderr.includes('argo gates inactive')
    expect(failClosedContract).toBe(false)
  })
})
