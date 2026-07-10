import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * toolkit-dispatch.mjs contract — the dependency-free plugin-side dispatcher
 * that replaced the raw `npx --no @argohq/toolkit ... || exit 2` wrapper (which
 * deadlocked bootstrap: it failed closed on ANY npx failure, blocking the very
 * `bun install` that would install the toolkit).
 *
 *   - project NOT argo-initialized (no package.json on the cwd ancestry
 *     declares @argohq/toolkit) → ALLOW (exit 0) with a one-line stderr warning
 *   - declared but unresolvable → BLOCK (exit 2) naming the fix
 *   - declared and resolvable → dispatch to the installed toolkit CLI, replaying
 *     stdin and propagating its exit code
 */

const DISPATCH = fileURLToPath(new URL('./toolkit-dispatch.mjs', import.meta.url))

let scratch

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'argo-toolkit-dispatch-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function hookInput(command, cwd) {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    cwd,
  })
}

function run(dir, { event = 'bash-pretooluse', command = 'git commit -m "x"' } = {}) {
  return spawnSync(process.execPath, [DISPATCH, event], {
    cwd: dir,
    input: hookInput(command, dir),
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function writePkg(dir, pkg) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
}

/** Install a fake @argohq/toolkit whose bin records its argv/stdin and exits with `exitCode`. */
function installFakeToolkit(root, { version = '0.1.1', exitCode = 0 } = {}) {
  const toolkitDir = join(root, 'node_modules', '@argohq', 'toolkit')
  writePkg(toolkitDir, { name: '@argohq/toolkit', version, bin: { argo: 'bin/argo.js' } })
  mkdirSync(join(toolkitDir, 'bin'), { recursive: true })
  writeFileSync(
    join(toolkitDir, 'bin', 'argo.js'),
    `#!/usr/bin/env node
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  console.error('FAKE-TOOLKIT argv=' + process.argv.slice(2).join(' ') + ' stdin-bytes=' + stdin.length)
  process.exit(${exitCode})
})
`
  )
}

describe('toolkit-dispatch: project not argo-initialized', () => {
  it('allows (exit 0) with a one-line warning when no package.json exists at all', () => {
    const res = run(scratch)
    expect(res.status).toBe(0)
    expect(res.stderr).toMatch(/@argohq\/toolkit/)
    expect(res.stderr.trim().split('\n')).toHaveLength(1)
  })

  it('allows (exit 0) when a package.json exists but does not declare @argohq/toolkit', () => {
    writePkg(scratch, { name: 'some-app', dependencies: { react: '^18.0.0' } })
    const res = run(scratch)
    expect(res.status).toBe(0)
    expect(res.stderr).toMatch(/@argohq\/toolkit/)
  })

  it('BOOTSTRAP: does not block the bun install that would install the toolkit', () => {
    writePkg(scratch, { name: 'fresh-project' })
    const res = run(scratch, { command: 'bun install' })
    expect(res.status).toBe(0)
  })
})

describe('toolkit-dispatch: armed project (declares @argohq/toolkit)', () => {
  it('blocks (exit 2) when declared but not installed, naming the fix', () => {
    writePkg(scratch, { name: 'armed-app', devDependencies: { '@argohq/toolkit': '^0.1.1' } })
    const res = run(scratch)
    expect(res.status).toBe(2)
    expect(res.stderr).toMatch(/bun install/)
  })

  it('stays armed when the declaration lives in an ancestor package.json (monorepo cwd)', () => {
    writePkg(scratch, { name: 'mono-root', dependencies: { '@argohq/toolkit': '^0.1.1' } })
    const nested = join(scratch, 'apps', 'web', 'src')
    mkdirSync(nested, { recursive: true })
    const res = run(nested)
    expect(res.status).toBe(2)
    expect(res.stderr).toMatch(/bun install/)
  })
})

describe('toolkit-dispatch: armed + installed → dispatches to the toolkit CLI', () => {
  it('runs the installed toolkit bin with `argo-hook <event>` and replays stdin', () => {
    writePkg(scratch, { name: 'armed-app', dependencies: { '@argohq/toolkit': '^0.1.1' } })
    installFakeToolkit(scratch, { exitCode: 0 })
    const res = run(scratch, { event: 'post-edit-write' })
    expect(res.status).toBe(0)
    expect(res.stderr).toContain('FAKE-TOOLKIT argv=argo-hook post-edit-write')
    expect(res.stderr).toMatch(/stdin-bytes=[1-9]/)
  })

  it('propagates a blocking exit code from the toolkit gates (fail-closed preserved)', () => {
    writePkg(scratch, { name: 'armed-app', dependencies: { '@argohq/toolkit': '^0.1.1' } })
    installFakeToolkit(scratch, { exitCode: 2 })
    const res = run(scratch)
    expect(res.status).toBe(2)
  })

  it('dispatches regardless of the declared range (no version check — workspace:*)', () => {
    writePkg(scratch, { name: 'armed-app', dependencies: { '@argohq/toolkit': 'workspace:*' } })
    installFakeToolkit(scratch, { version: '0.1.1', exitCode: 0 })
    const res = run(scratch)
    expect(res.status).toBe(0)
  })

  it('resolves a hoisted install (node_modules above the declaring package.json)', () => {
    installFakeToolkit(scratch, { exitCode: 0 })
    const app = join(scratch, 'packages', 'app')
    writePkg(app, { name: 'app', dependencies: { '@argohq/toolkit': '^0.1.1' } })
    const res = run(app)
    expect(res.status).toBe(0)
    expect(res.stderr).toContain('FAKE-TOOLKIT')
  })
})
