#!/usr/bin/env node
/**
 * Trust gate (§8.2) — the code-enforced centerpiece. Decides whether a build slice
 * may land by reading the LAUNCH EVIDENCE RECEIPT a real run wrote, never prose.
 *
 * Wired as a Stop hook (and callable directly by the workflow's Verify step). It is
 * the DELIBERATE OPPOSITE of the pipe-to-shell hook: that one allows on malformed
 * input; this one DENIES on anything missing, unparseable, incomplete, or stale.
 * Fail closed — the only path to exit 0 is a receipt proving the app launched AND
 * did something observable (an OSC-777 prompt_submit/stop or an MCP report_status).
 *
 * Exit 0  → PASS (land allowed).
 * Exit 2  → BLOCK (RED), with the reason on stderr.
 *
 * Self-contained: reads .argo/launch-receipt.json relative to the hook's cwd, with
 * no dependency on @argo/core (the plugin is independently distributable).
 */

import { readFileSync } from 'node:fs'
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

// default-deny: malformed hook input → BLOCK (opposite of the pipe-to-shell hook)
let hook
try {
  hook = JSON.parse(raw)
} catch {
  block('hook input was not valid JSON (default-deny)')
}

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) block('hook input had no cwd')

let receipt
try {
  receipt = JSON.parse(readFileSync(join(cwd, '.argo', 'launch-receipt.json'), 'utf8'))
} catch {
  block('no launch evidence — the app was never launched (no/unreadable receipt)')
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
