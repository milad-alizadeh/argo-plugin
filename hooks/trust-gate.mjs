#!/usr/bin/env node
/**
 * Trust gate (§8.2) — decides whether a build slice may land by reading the LAUNCH
 * EVIDENCE RECEIPT a real run wrote, never prose. Registered as a PreToolUse hook on
 * Bash, enforcing only `git commit` commands.
 *
 * SELF-SCOPING (same contract as red-proof-gate): entirely inert unless
 * `.argo/build-mode.json` exists in the session cwd AND marks the current slice
 * `requiresLaunch: true`. The build-plan skill maintains that marker; outside a
 * gated build — normal commits, non-Argo host projects — this hook always exits 0.
 * The gate is Argo-runtime-specific by design: the receipt is written by the Argo
 * app's own launch evidence recorder; generalizing it is documented out of scope.
 *
 * INSIDE a gated launch-slice it is fail-closed — the deliberate opposite of the
 * pipe-to-shell hook: anything missing, unparseable, incomplete, or stale DENIES.
 * The only path to exit 0 is a receipt proving the app launched AND did something
 * observable (an OSC-777 prompt_submit/stop or an MCP report_status).
 *
 * Receipt search: `<cwd>/.argo/launch-receipt.json`, then one workspace level down
 * (`<cwd>/apps/<ws>/.argo/...`) — the launched app writes the receipt relative to
 * ITS OWN cwd, which in a monorepo is the workspace dir, not the repo root.
 *
 * Exit 0 → PASS (land allowed). Exit 2 → BLOCK (RED), reason on stderr.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MAX_RECEIPT_AGE_MS = 10 * 60 * 1000 // a receipt older than this is stale → BLOCK

function block(reason) {
  process.stderr.write(`Trust gate: BLOCKED (RED) — ${reason}\n`)
  process.exit(2)
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
  })
}

const raw = await readStdin().catch(() => '')
let hook
try {
  hook = JSON.parse(raw)
} catch {
  process.exit(0) // not in a gated build context — scope check below is what arms us
}

const command = hook?.tool_input?.command
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\bcommit\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const markerPath = join(cwd, '.argo', 'build-mode.json')
if (!existsSync(markerPath)) process.exit(0) // not a gated build — inert

// From here on: gated build → fail closed (default-deny).
let mode
try {
  mode = JSON.parse(readFileSync(markerPath, 'utf8'))
} catch {
  block('build-mode.json is unreadable/malformed (default-deny inside a gated build)')
}

// Pure logic/library/config slices don't ship launchable behaviour — unaffected.
if (mode?.requiresLaunch !== true) process.exit(0)

function findReceipt(root) {
  const direct = join(root, '.argo', 'launch-receipt.json')
  if (existsSync(direct)) return direct
  const appsDir = join(root, 'apps')
  try {
    for (const ws of readdirSync(appsDir)) {
      const p = join(appsDir, ws, '.argo', 'launch-receipt.json')
      if (existsSync(p)) return p
    }
  } catch {
    /* no apps/ dir — single-app layout */
  }
  return null
}

const receiptPath = findReceipt(cwd)
if (!receiptPath) block('no launch evidence — the app was never launched (no receipt found)')

let receipt
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
