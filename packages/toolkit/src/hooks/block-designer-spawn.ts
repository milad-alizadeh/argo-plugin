#!/usr/bin/env node
// PreToolUse Task guard: blocks a designer agent from spawning a sub-agent. Detected via a marker string in the session transcript since the payload has no "which agent" field. Fail-open on missing/unreadable transcript or malformed stdin.
import { readFileSync, existsSync } from 'node:fs'

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

// Guarded: an unconditional main() would block on stdin when the unit test imports this module directly, hanging the test runner.
if (import.meta.url === `file://${process.argv[1]}`) main()
