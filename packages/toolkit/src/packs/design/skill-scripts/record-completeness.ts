#!/usr/bin/env node
/**
 * P4b tracking (design-screen SKILL.md §4b): records that the advisory
 * completeness check RAN for a screen — the existence proof the design-guard
 * stop gate requires. Content-free by design: the gate never inspects what the
 * check found (the human may knowingly ship over `absent` flags), only that it
 * ran. Pass the verifier's summary via `--result` for the operator's log; it is
 * echoed, not gated on.
 *
 * Per-session, keyed by `CLAUDE_CODE_SESSION_ID`. No session id → no-op.
 */

import { recordScreenCompleteness } from '../../../lib/session-guard.js'
import { resolveRepoRoot } from '../../../lib/repo-root.js'

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const screen = flagValue(args, '--screen')
  if (!screen) {
    process.stderr.write('record-completeness: usage: argo design record-completeness --screen <name> [--result <summary>]\n')
    process.exit(1)
  }
  const result = flagValue(args, '--result')
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID
  if (!sessionId) {
    process.stderr.write('record-completeness: no CLAUDE_CODE_SESSION_ID — completeness gate is per-session, skipping\n')
    process.exit(0)
  }
  recordScreenCompleteness(resolveRepoRoot(process.cwd()), sessionId, screen, Date.now())
  process.stderr.write(`record-completeness: "${screen}" completeness check recorded${result ? ` (${result})` : ''}\n`)
}
