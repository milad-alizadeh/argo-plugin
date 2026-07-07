#!/usr/bin/env node
/**
 * Plugin-side kit dispatcher (PreToolUse/PostToolUse/Stop wrappers in
 * hooks.json). Dependency-free on purpose: it must work in a project where
 * `bun install` has never run.
 *
 * Replaces the raw `npx --no @argohq/kit argo-hook <event> || exit 2`
 * one-liner, which deadlocked bootstrap: it failed closed on ANY npx failure,
 * blocking the very `bun install` that would install @argohq/kit.
 *
 * Decision table (walking up from the hook's cwd):
 *   - no package.json on the ancestry declares @argohq/kit and no install is
 *     resolvable → ALLOW (exit 0) with a one-line warning: the project is not
 *     argo-initialized, there is nothing to enforce yet
 *   - declared but not installed → BLOCK (exit 2) naming the fix
 *   - resolvable → dispatch `argo-hook <event>` to the installed kit CLI,
 *     replaying stdin and propagating its exit code (fail-closed preserved)
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const KIT = '@argohq/kit'
const event = process.argv[2] ?? ''

function readStdin() {
  return new Promise((res) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => res(data))
    process.stdin.on('error', () => res(data))
  })
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Ancestor dirs of `start`, innermost first, including `start` itself. */
function ancestry(start) {
  const dirs = []
  let dir = resolve(start)
  while (true) {
    dirs.push(dir)
    const parent = dirname(dir)
    if (parent === dir) return dirs
    dir = parent
  }
}

/** Nearest package.json that declares @argohq/kit (any dep field), or null. */
function findDeclaration(dirs) {
  for (const dir of dirs) {
    const pkg = readJson(join(dir, 'package.json'))
    if (!pkg) continue
    if (pkg.name === KIT) return { dir, range: pkg.version }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const range = pkg[field]?.[KIT]
      if (typeof range === 'string') return { dir, range }
    }
  }
  return null
}

/**
 * Standard node_modules walk-up (manual: the kit's `exports` map does not
 * expose ./package.json, so require.resolve can't be used here).
 */
function findInstall(dirs) {
  for (const dir of dirs) {
    const pkgFile = join(dir, 'node_modules', KIT, 'package.json')
    if (!existsSync(pkgFile)) continue
    const pkg = readJson(pkgFile)
    if (!pkg) continue
    return { root: join(dir, 'node_modules', KIT), version: pkg.version, bin: pkg.bin }
  }
  return null
}

const raw = await readStdin().catch(() => '')
let hookCwd
try {
  hookCwd = JSON.parse(raw)?.cwd
} catch {
  /* malformed input — fall back to process.cwd() */
}
const dirs = ancestry(typeof hookCwd === 'string' && hookCwd ? hookCwd : process.cwd())

const declaration = findDeclaration(dirs)
const install = findInstall(dirs)

if (!declaration && !install) {
  process.stderr.write(`argo: project not argo-initialized (no ${KIT} on the cwd ancestry) — kit gates inactive, run /argo:init to arm them\n`)
  process.exit(0)
}

if (!install) {
  process.stderr.write(
    `argo gates inactive: ${KIT} is declared (${declaration.dir}/package.json) but not installed — run bun install (or /argo:init)\n`
  )
  process.exit(2)
}

const binRel = typeof install.bin === 'string' ? install.bin : install.bin?.argo ?? 'bin/argo.js'
const binPath = join(install.root, binRel)
const res = spawnSync(process.execPath, [binPath, 'argo-hook', event], {
  input: raw,
  stdio: ['pipe', 'inherit', 'inherit'],
})
if (res.error) {
  process.stderr.write(`argo gates inactive: failed to run ${binPath} (${res.error.message}) — run bun install (or /argo:init)\n`)
  process.exit(2)
}
process.exit(res.status ?? 2)
