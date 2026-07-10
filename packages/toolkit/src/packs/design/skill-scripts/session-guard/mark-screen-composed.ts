#!/usr/bin/env node
/**
 * P4b tracking (design-screen SKILL.md §2): records that this session COMPOSED a
 * screen, so the design-guard stop gate knows a completeness check is now owed
 * for it. Call it right after composing a screen's frame. Re-composing resets
 * the owed state (the prior check is stale against the new build).
 *
 * Per-session, keyed by `CLAUDE_CODE_SESSION_ID` (same value the stop hook reads
 * from its payload's `session_id`). No session id → no-op (the gate is
 * per-session; nothing to attribute).
 */

import { markScreenComposed } from '../../../../lib/session-guard.js'
import { resolveRepoRoot } from '../../../../lib/repo-root.js'

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const screen = flagValue(args, '--screen')
  if (!screen) {
    process.stderr.write('mark-screen-composed: usage: argo design mark-screen-composed --screen <name>\n')
    process.exit(1)
  }
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID
  if (!sessionId) {
    process.stderr.write('mark-screen-composed: no CLAUDE_CODE_SESSION_ID — completeness gate is per-session, skipping\n')
    process.exit(0)
  }
  markScreenComposed(resolveRepoRoot(process.cwd()), sessionId, screen, Date.now())
  process.stderr.write(`mark-screen-composed: "${screen}" marked composed (completeness check now owed)\n`)
}
