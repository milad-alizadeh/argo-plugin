#!/usr/bin/env node
/**
 * Decides whether a build slice may land by reading the launch evidence receipt a
 * real run wrote, never prose. Inert unless armed with `requiresLaunch: true`;
 * fail-closed once armed — only a receipt proving the app launched AND did something
 * observable (OSC-777 or MCP report_status) passes. Self-attested by the builder
 * session / the app it launched, not an independent runner. Alias scope: `commit`/`ci` only.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildModePath, launchReceiptPath } from '../../config/argo-paths.js'

const MAX_RECEIPT_AGE_MS = 10 * 60 * 1000 // a receipt older than this is stale → BLOCK

function block(reason: string): never {
  process.stderr.write(`Trust gate: BLOCKED (RED) — ${reason}\n`)
  process.exit(2)
}

function readStdin(): Promise<string> {
  return new Promise((resolvePromise) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolvePromise(data))
  })
}

const raw = await readStdin().catch(() => '')
let hook: any
try {
  hook = JSON.parse(raw)
} catch {
  process.exit(0) // not in a gated build context — scope check below is what arms us
}

const command = hook?.tool_input?.command
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

/** Resolve the effective repo dir via -C/--git-dir/--work-tree, not raw cwd, so a redirected commit can't dodge the gate. */
function effectiveRepoDir(command: string, cwd: string): string {
  const flagValue = (re: RegExp) => {
    const m = re.exec(command)
    return m ? (m[2] ?? m[3] ?? m[4]) : null
  }

  let dir = cwd
  const cRe = /(?:^|\s)-C\s+("([^"]+)"|'([^']+)'|(\S+))/g
  let m: RegExpExecArray | null
  while ((m = cRe.exec(command))) {
    dir = resolve(dir, m[2] ?? m[3] ?? m[4])
  }

  const workTree = flagValue(/--work-tree(?:=|\s+)("([^"]+)"|'([^']+)'|(\S+))/)
  if (workTree) return resolve(dir, workTree)

  const gitDir = flagValue(/--git-dir(?:=|\s+)("([^"]+)"|'([^']+)'|(\S+))/)
  if (gitDir) {
    const resolved = resolve(dir, gitDir)
    return resolved.endsWith(`${sep}.git`) ? resolved.slice(0, -`${sep}.git`.length) : resolved
  }

  // Ascend to the repo toplevel: the marker lives at the root, so a commit run
  // from a subdirectory of an armed repo must not slip past the gate.
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim()
    if (top) return top
  } catch {
    /* not a git repo — keep dir */
  }
  return dir
}

const repoDir = effectiveRepoDir(command, cwd)
const markerPath = buildModePath(repoDir)
if (!existsSync(markerPath)) process.exit(0) // not a gated build — inert

// From here on: gated build → fail closed (default-deny).
let mode: any
try {
  mode = JSON.parse(readFileSync(markerPath, 'utf8'))
} catch {
  block('build-mode.json is unreadable/malformed (default-deny inside a gated build)')
}

// Pure logic/library/config slices don't ship launchable behaviour — unaffected.
if (mode?.requiresLaunch !== true) process.exit(0)

function findReceipt(root: string): string | null {
  const direct = launchReceiptPath(root)
  if (existsSync(direct)) return direct
  const appsDir = join(root, 'apps')
  try {
    for (const ws of readdirSync(appsDir)) {
      const p = launchReceiptPath(join(appsDir, ws))
      if (existsSync(p)) return p
    }
  } catch {
    /* no apps/ dir — single-app layout */
  }
  return null
}

const receiptPath = findReceipt(repoDir)
if (!receiptPath) block('no launch evidence — the app was never launched (no receipt found)')

let receipt: any
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
} catch {
  block('launch receipt is unreadable/malformed (default-deny)')
}

// structural validation — a receipt missing required fields is not evidence
const wellFormed =
  receipt &&
  typeof receipt.sessionId === 'string' &&
  typeof receipt.startedAt === 'number' &&
  (receipt.exitCode === null || typeof receipt.exitCode === 'number') &&
  typeof receipt.exercised === 'boolean' &&
  typeof receipt.shape === 'string'
if (!wellFormed) block('receipt is malformed / missing required fields (default-deny)')

if (receipt.exitCode === null) block('launch is still running (exitCode:null) — refusing to pass a half-run')
if (receipt.exitCode !== 0) block(`launch exited non-zero (exitCode ${receipt.exitCode})`)
if (!receipt.exercised) block('launched but never exercised — no observable evidence through the real surface')

const age = Date.now() - receipt.startedAt
// Reject BOTH stale (past) and future-dated receipts — a negative age (clock skew or a
// forged future startedAt) must never slip past the staleness guard (fail closed).
if (age < 0 || age > MAX_RECEIPT_AGE_MS) block(`receipt timestamp out of range (${Math.round(age / 1000)}s) — re-launch required`)

process.exit(0) // PASS — a real launch did something observable
