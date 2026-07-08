#!/usr/bin/env node
/**
 * "Park with acknowledged pending work" affordance (fidelity-geometry-
 * verifier.md Slice 14) — a stop-gate escape hatch, not a new workflow: one
 * session-scoped acknowledgment file (`recordPendingAck`,
 * `../lib/session-guard.js`), checked by `design-guard-stop.js` before its
 * normal blocking logic. Explicitly NOT built (owner mandate against
 * speculative scope): no expiry/review workflow, no cross-session
 * aggregation, no dashboard — "end this session honestly with a stated
 * reason," nothing more.
 *
 * `argo design ack-pending-work --reason "<non-empty text>"`.
 */

import { recordPendingAck } from '../lib/session-guard.js'
import { resolveRepoRoot } from '../lib/repo-root.js'

export function ackPendingWork(
  { reason }: { reason?: string },
  { cwd, sessionId, now = Date.now() }: { cwd: string; sessionId: string; now?: number }
): void {
  if (!reason || reason.trim().length === 0) {
    throw new Error('ackPendingWork: --reason is required and must be a non-empty, real reason (never a blank rubber stamp)')
  }
  const repoRoot = resolveRepoRoot(cwd)
  recordPendingAck(repoRoot, sessionId, reason, now)
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const reason = flagValue(args, '--reason')
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID
  if (!sessionId) {
    process.stderr.write('ack-pending-work: no CLAUDE_CODE_SESSION_ID — the pending-ack affordance is per-session, cannot record\n')
    process.exit(1)
  }
  try {
    ackPendingWork({ reason }, { cwd: process.cwd(), sessionId })
  } catch (err: any) {
    process.stderr.write(`ack-pending-work: ${err.message}\n`)
    process.exit(1)
  }
  process.stderr.write(`ack-pending-work: pending work acknowledged ("${reason}")\n`)
}
