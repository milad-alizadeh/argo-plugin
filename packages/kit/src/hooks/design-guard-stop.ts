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
 * PER-SESSION (per-session-design-gate.md): each session is judged ONLY by
 * its own files — `.argo/design-guard/<sid>.json` (its write count) and
 * `.argo/audit-receipts/<sid>.json` (its audit result). A session with no such
 * file made no writes → bystander, pass. Otherwise: no receipt, a live write
 * count ahead of the receipt's `writeCountAtAudit`, a configured app missing
 * from the receipt, or a per-app violationCount > 0 → BLOCK. Another session's
 * writes live in other files and are invisible here, so two design sessions on
 * one Figma file never hold each other hostage. A Stop with no `session_id`, or
 * a session with no per-session file, falls back to the legacy global counter +
 * committed `design/audit-receipt.json` (default-deny).
 *
 * DEFERRAL (in-flight background work): the Stop/SubagentStop payload carries
 * `background_tasks` (running/pending/backgrounded work on this session — see
 * the Claude Code hooks schema); when non-empty, this hook defers (exit 0)
 * rather than blocks, since the session is about to pause for that work, not
 * end. The next real Stop re-checks — the gate is postponed, never bypassed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeBlock } from './lib/gate-block.js'
import { findArgoJson, setUpDesignApps } from '../config/argo-json.js'
import { resolveRepoRoot } from '../lib/repo-root.js'
import {
  appKeyForRoot,
  readSessionReceipt,
  readSessionWriteCount,
  pruneStaleSessionFiles,
  pendingCompletenessScreens
} from '../lib/session-guard.js'

const block = makeBlock('Design guard')

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
  process.exit(0) // malformed stdin — inert
}

if (hook?.hook_event_name !== 'Stop' && hook?.hook_event_name !== 'SubagentStop') process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoRoot = resolveRepoRoot(cwd)
const designApps = setUpDesignApps(findArgoJson(repoRoot)?.config)
if (designApps.length === 0) process.exit(0) // design pack not installed — inert

const backgroundTasks = Array.isArray(hook?.background_tasks) ? hook.background_tasks : []
if (backgroundTasks.length > 0) process.exit(0) // in-flight subagent/workflow may still write Figma changes — defer, don't block

const sessionId = typeof hook?.session_id === 'string' && hook.session_id.length > 0 ? hook.session_id : null

// Best-effort GC of aged per-session files; must never block the gate.
try {
  pruneStaleSessionFiles(repoRoot, Date.now())
} catch {
  /* ignore */
}

// --- Per-session path (per-session-design-gate.md) --------------------------
// When this session has its own write-count file, judge it ONLY against its
// own state + receipt. Another session's writes are invisible here, so two
// design sessions on one Figma file never hold each other hostage.
if (sessionId) {
  const liveCount = readSessionWriteCount(repoRoot, sessionId)
  // A session is judged ONLY by its own per-session files. No file (or zero
  // writes) → this session is a bystander, nothing owed — it is never dragged
  // into another session's writes or the legacy global counter. A session that
  // actually wrote always has a per-session file (the record hook writes one),
  // so this can't be used to dodge a real debt.
  if (liveCount === null || liveCount === 0) process.exit(0)

  const receipt =
    readSessionReceipt(repoRoot, sessionId) ??
    block(`${liveCount} Figma write(s) in this session with no audit receipt — run /argo:figma-audit before stopping`)
  if (typeof receipt.writeCountAtAudit !== 'number' || receipt.writeCountAtAudit !== liveCount)
    block('Figma writes happened in this session after the last clean audit — re-run /argo:figma-audit before stopping')
  const apps = (receipt.apps ?? {}) as Record<string, { componentNames?: string[]; violationCount?: number }>
  for (const { block: designBlock } of designApps) {
    const appKey = appKeyForRoot(designBlock.root)
    const entry =
      apps[appKey] ??
      block(`Figma writes recorded with no audit for "${appKey}" in this session's receipt — run /argo:figma-audit before stopping`)
    if (typeof entry.violationCount !== 'number' || entry.violationCount !== 0)
      block(`last audit found ${entry.violationCount ?? 'unknown'} violation(s) in ${appKey} — fix and re-audit before stopping`)
  }

  // P4b completeness must-exist gate (existence only, never content): a screen
  // this session COMPOSED must have had its advisory completeness check RUN
  // (`argo design record-completeness`). This blocks a silent skip of the check,
  // never on what the check found — the human may knowingly ship over `absent`
  // flags; they may not skip running it. Re-composing a screen re-owes the check.
  const pending = pendingCompletenessScreens(repoRoot, sessionId)
  if (pending.length > 0)
    block(
      `screen(s) composed without running the completeness check: ${pending.join(', ')} — run the P4b design-verifier and \`argo design record-completeness\` before stopping (it does not have to come back all-present; it just has to run)`
    )

  process.exit(0)
}

// --- Legacy fallback --------------------------------------------------------
// Sessions that wrote under the old shared-counter hook, or a payload with no
// session_id. Default-deny against the repo-global counter + committed receipt.
const statePath = join(repoRoot, '.argo', 'design-guard.json')
if (!existsSync(statePath)) process.exit(0) // no legacy Figma writes recorded — nothing owed

let state: any
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'))
} catch {
  block('.argo/design-guard.json is unreadable/malformed (default-deny once Figma writes are recorded)')
}
const writeCount = typeof state.writeCount === 'number' ? state.writeCount : 0
if (writeCount === 0) process.exit(0)

for (const { block: designBlock } of designApps) {
  const appRoot = designBlock.root ?? '.'
  const receiptPath = join(repoRoot, appRoot, 'design', 'audit-receipt.json')
  if (!existsSync(receiptPath))
    block(`${writeCount} Figma write(s) recorded with no audit receipt at ${appRoot}/design/audit-receipt.json — run /argo:figma-audit before stopping`)

  let receipt: any
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
