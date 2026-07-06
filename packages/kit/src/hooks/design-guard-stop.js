#!/usr/bin/env node
/**
 * Design-guard stop gate (Stop + SubagentStop). Same UX as the trust gate
 * (exit 2 blocks, reason on stderr) but a DIFFERENT arming rule: this checks
 * whether Figma writes recorded by design-guard-record.js are newer than
 * the latest clean tier-0 audit receipt, and blocks the stop until the audit
 * gate is run.
 *
 * SELF-SCOPING: entirely inert unless a `design.<app>` block in
 * `.claude/argo.json` at the session's git toplevel carries a `recipe`
 * (the design-pack-installed marker) — NOT scoped to
 * `.argo/build-mode.json`. Unlike
 * red-proof/trust (gated-build-only, TDD-slice concerns), figma-to-code and
 * figma-create can legitimately run outside a gated build, and the
 * deterministic audit-receipt requirement must still be mandatory there. So
 * this hook arms in every session type a design pack is installed in.
 *
 * Once armed: no recorded writes at all → nothing owed, pass. Any recorded
 * write with no receipt, a receipt with violationCount > 0, or a receipt
 * whose writeCounterAtAudit is stale (writes happened after the last clean
 * audit) → BLOCK, telling the agent to run the audit gate.
 *
 * DEFERRAL (in-flight background work): `.argo/design-guard.json`'s
 * writeCount is repo-global, not session-scoped — a designer fan-out
 * (Task-tool subagent) still running writes to the same counter the parent
 * session's Stop hook reads. Without this, the parent could never end a
 * turn cleanly while that fan-out is mid-flight: any receipt it audits goes
 * stale the instant the subagent writes again. The Stop/SubagentStop hook
 * payload carries `background_tasks` (running/pending + backgrounded work
 * registered on this session — see the Claude Code hooks schema); when
 * non-empty, this hook defers rather than blocks, since the session is
 * about to pause for that work anyway, not actually end. Once nothing is
 * in flight, the next real Stop re-checks the receipt against the
 * up-to-date write counter — the gate is never actually bypassed, only
 * postponed past writes it isn't this hook's job to have caught yet.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeBlock } from './lib/gate-block.js'
import { findArgoJson, setUpDesignApps } from '../config/argo-json.js'
import { resolveRepoRoot } from '../lib/repo-root.js'

const block = makeBlock('Design guard')

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
const designApps = setUpDesignApps(findArgoJson(repoRoot)?.config)
if (designApps.length === 0) process.exit(0) // design pack not installed — inert

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

const backgroundTasks = Array.isArray(hook?.background_tasks) ? hook.background_tasks : []
if (backgroundTasks.length > 0) process.exit(0) // in-flight subagent/workflow may still write Figma changes — defer, don't block

// Per-session attribution: `.argo/design-guard.json`'s writeCount is
// repo-global, so a SEPARATE session's Figma writes must not block a
// bystander session that made none itself. A missing session_id can't be
// used to dodge the gate, so it falls back to the global (default-deny)
// count below.
const sessionId = typeof hook?.session_id === 'string' && hook.session_id.length > 0 ? hook.session_id : null
if (sessionId) {
  const sessions = typeof state.sessions === 'object' && state.sessions !== null ? state.sessions : {}
  const sessionWriteCount = typeof sessions[sessionId]?.writeCount === 'number' ? sessions[sessionId].writeCount : 0
  if (sessionWriteCount === 0) process.exit(0) // this session made zero Figma writes — nothing owed
}

// Receipts are installed per design app (root-relative, matching the
// record-audit-receipt CLI's write location) — never at the repo root, so a
// monorepo's app receipt is what the writer actually produces.
for (const { block: designBlock } of designApps) {
  const appRoot = designBlock.root ?? '.'
  const receiptPath = join(repoRoot, appRoot, 'design', 'audit-receipt.json')
  if (!existsSync(receiptPath))
    block(`${writeCount} Figma write(s) recorded with no audit receipt at ${appRoot}/design/audit-receipt.json — run /argo:figma-audit before stopping`)

  let receipt
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  } catch {
    block(`${appRoot}/design/audit-receipt.json is unreadable/malformed (default-deny)`)
  }

  if (typeof receipt.violationCount !== 'number' || receipt.violationCount !== 0)
    block(`last audit found ${receipt.violationCount ?? 'unknown'} violation(s) in ${appRoot} — fix and re-audit before stopping`)

  if (receipt.writeCounterAtAudit !== writeCount)
    block(`Figma writes happened after the last clean audit in ${appRoot} — re-run /argo:figma-audit before stopping`)
}

process.exit(0)
