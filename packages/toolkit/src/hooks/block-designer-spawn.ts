#!/usr/bin/env node
/**
 * block-designer-spawn — PreToolUse Task guard: hard-blocks a `Task` call
 * from a `designer` agent session (R1 backstop).
 *
 * WHY: designer.md's "you are a LEAF" prose already failed once (a real
 * transcript had the designer improvise a sub-fleet) — the flat fan-out
 * obligation belongs to the supervisor (skills/orchestrate/SKILL.md), never
 * to the leaf agent itself. The agent `tools:` frontmatter allowlist is
 * deliberately unavailable here (all-or-nothing; would strip the
 * variable-named Figma MCP tools designer.md documents inheriting), so this
 * hook is the only enforcement point that doesn't fight that constraint.
 *
 * DETECTION: Claude Code's PreToolUse payload carries no direct "which agent
 * is running" field, so this reads the session's own transcript
 * (`hook.transcript_path`) and looks for a marker string unique to
 * designer.md's own system-prompt body. Fail-open on any missing/unreadable
 * transcript or malformed stdin — this is a backstop for a prose rule already
 * stated in designer.md, not the only line of defense.
 */
import { readFileSync, existsSync } from 'node:fs'

// Unique to designer.md's body (agents/designer.md) — not shared with any
// other agent's prompt.
const DESIGNER_MARKER = 'You build and edit designs inside a live Figma file'

export function isDesignerTranscript(content: unknown): boolean {
  return typeof content === 'string' && content.includes(DESIGNER_MARKER)
}

function main(): void {
  let hook: any
  try {
    hook = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0)
  }
  if (hook?.hook_event_name !== 'PreToolUse' || hook?.tool_name !== 'Task') process.exit(0)

  const transcriptPath = hook?.transcript_path
  if (typeof transcriptPath !== 'string' || !existsSync(transcriptPath)) process.exit(0)

  let content: string
  try {
    content = readFileSync(transcriptPath, 'utf8')
  } catch {
    process.exit(0)
  }

  if (isDesignerTranscript(content)) {
    process.stderr.write(
      'block-designer-spawn: BLOCKED — designer is a LEAF (R1): it never spawns a sub-agent via ' +
        'Task. Do the work yourself across turns and report directly to the caller; the flat ' +
        'fan-out obligation belongs to the supervisor (skills/orchestrate/SKILL.md), not this agent.\n'
    )
    process.exit(2)
  }
  process.exit(0)
}

// Guarded (unlike the other hook modules in this dir): this file's pure
// `isDesignerTranscript` export is imported directly by its unit test (not
// spawned as a subprocess) — a bare top-level `main()` call would
// synchronously block on stdin during that import and hang the test runner.
// Claude Code always invokes this file directly via `argo-hook
// block-designer-spawn` (spawned, `import.meta.url === argv[1]`), where this
// check is true, so the real CLI behavior is unchanged.
if (import.meta.url === `file://${process.argv[1]}`) main()
