/**
 * Shared harness for the dual-mode acid suites (Slice 6) — copies a committed
 * fixture repo to a temp dir, materializes what `bun link` produces (a
 * node_modules/@argohq/kit symlink into THIS repo's packages/kit + the bin
 * shim), and runs the real `argo` CLI against it. Lives in test/ by the
 * co-location exceptions (harness, not a unit test).
 */
import { cpSync, mkdtempSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const KIT_DIR = join(REPO_ROOT, 'packages', 'kit')
export const ARGO_BIN = join(KIT_DIR, 'bin', 'argo.js')

export const FIXTURES = {
  monorepo: fileURLToPath(new URL('./fixtures/acid-monorepo', import.meta.url)),
  singleRepo: fileURLToPath(new URL('./fixtures/acid-single-repo', import.meta.url)),
}

/** Copy a fixture to a fresh temp dir and git-init it (the gates read the staged diff). */
export function materializeFixture(fixturePath) {
  const dir = mkdtempSync(join(tmpdir(), 'argo-acid-'))
  cpSync(fixturePath, dir, { recursive: true })
  execFileSync('git', ['-C', dir, 'init', '-q'])
  return dir
}

/** What `bun link @argohq/kit` produces in a consumer, materialized hermetically.
 * `withVitest` also links this repo's vitest install (a real host has its own). */
export function linkKit(hostRoot, { withVitest = false } = {}) {
  mkdirSync(join(hostRoot, 'node_modules', '@argohq'), { recursive: true })
  symlinkSync(KIT_DIR, join(hostRoot, 'node_modules', '@argohq', 'kit'))
  mkdirSync(join(hostRoot, 'node_modules', '.bin'), { recursive: true })
  symlinkSync(join(hostRoot, 'node_modules', '@argohq', 'kit', 'bin', 'argo.js'), join(hostRoot, 'node_modules', '.bin', 'argo'))
  if (withVitest) {
    symlinkSync(join(REPO_ROOT, 'node_modules', 'vitest'), join(hostRoot, 'node_modules', 'vitest'))
  }
}

export function runArgo(hostRoot, args) {
  return spawnSync(process.execPath, [ARGO_BIN, ...args, '--host-root', hostRoot], {
    cwd: hostRoot,
    encoding: 'utf8',
  })
}

/** Fire a hook exactly like Claude Code does: PreToolUse JSON on stdin through argo-hook. */
export function fireBashPreToolUse(hostRoot, command) {
  return spawnSync(process.execPath, [ARGO_BIN, 'argo-hook', 'bash-pretooluse'], {
    cwd: hostRoot,
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: hostRoot }),
    encoding: 'utf8',
  })
}

export function readJson(hostRoot, ...segments) {
  return JSON.parse(readFileSync(join(hostRoot, ...segments), 'utf8'))
}

export function writeJson(hostRoot, segments, data) {
  const path = join(hostRoot, ...segments)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
}

export { existsSync, join, execFileSync }
