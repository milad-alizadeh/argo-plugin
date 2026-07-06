#!/usr/bin/env node
/**
 * Design-guard stop gate (Stop + SubagentStop). Same UX as the trust gate
 * (exit 2 blocks, reason on stderr) but a DIFFERENT arming rule: this checks
 * whether Figma writes recorded by design-guard-record.js are newer than
 * the latest clean tier-0 audit receipt, and blocks the stop until the audit
 * gate is run.
 *
 * SELF-SCOPING: entirely inert unless `design/config.json` exists at the
 * session's git toplevel — NOT scoped to `.argo/build-mode.json`. Unlike
 * red-proof/trust (gated-build-only, TDD-slice concerns), figma-to-code and
 * figma-create can legitimately run outside a gated build, and the
 * deterministic audit-receipt requirement must still be mandatory there. So
 * this hook arms in every session type a design pack is installed in.
 *
 * Once armed: no recorded writes at all → nothing owed, pass. Any recorded
 * write with no receipt, a receipt with violationCount > 0, or a receipt
 * whose writeCounterAtAudit is stale (writes happened after the last clean
 * audit) → BLOCK, telling the agent to run the audit gate.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.js'

const block = makeBlock('Design guard')

function resolveRepoRoot(cwd) {
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (top) return top
  } catch {
    /* not a git repo — fall back to cwd */
  }
  return cwd
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
  process.exit(0) // malformed stdin — inert
}

if (hook?.hook_event_name !== 'Stop' && hook?.hook_event_name !== 'SubagentStop') process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoRoot = resolveRepoRoot(cwd)
if (!existsSync(join(repoRoot, 'design', 'config.json'))) process.exit(0) // design pack not installed — inert

const statePath = join(repoRoot, '.argo', 'design-guard.json')
if (!existsSync(statePath)) process.exit(0) // no Figma writes ever recorded — nothing owed

let state
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'))
} catch {
  block('.argo/design-guard.json is unreadable/malformed (default-deny once Figma writes are recorded)')
}
const writeCount = typeof state.writeCount === 'number' ? state.writeCount : 0
if (writeCount === 0) process.exit(0)

const receiptPath = join(repoRoot, 'design', 'audit-receipt.json')
if (!existsSync(receiptPath))
  block(`${writeCount} Figma write(s) recorded with no audit receipt — run /argo:figma-audit before stopping`)

let receipt
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
} catch {
  block('design/audit-receipt.json is unreadable/malformed (default-deny)')
}

if (typeof receipt.violationCount !== 'number' || receipt.violationCount !== 0)
  block(`last audit found ${receipt.violationCount ?? 'unknown'} violation(s) — fix and re-audit before stopping`)

if (receipt.writeCounterAtAudit !== writeCount)
  block('Figma writes happened after the last clean audit — re-run /argo:figma-audit before stopping')

process.exit(0)
