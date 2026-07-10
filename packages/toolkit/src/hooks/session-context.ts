#!/usr/bin/env node
/** Card is a POINTER to skills/agents, never a summary, or agents take the
 * summary as a shortcut. Budget <=600 tokens (enforced by test); fails open. */

const CARD = `## Argo way of working

This project uses the argo plugin. Before acting on ANY non-trivial task,
check whether an argo skill or agent owns it — if there is even a small
chance one applies, invoke it instead of improvising.

Routing (canonical loop):
- new project/app → /argo:scaffold
- stress-test a design or plan → /argo:grill-me
- implementation plan from real code → argo:planner agent
- build an existing plan hands-off → /argo:build-plan
- interactive TDD on one slice → /argo:test-first
- something is broken/failing → /argo:root-cause (argo:debugger agent)
- merge-gate review of a diff/branch → argo:reviewer agent
- land finished work (push + PR) → argo:integrator agent
- context running long → /argo:session-handoff

Code questions ("where does X live", "what depends on Y"): if a
graphify-out/ directory exists, query the graphify knowledge graph FIRST —
concrete commands, run from the workspace that owns graphify-out/:
\`graphify query "<question>"\` (broad, natural-language),
\`graphify explain "<Symbol>"\` (one node + neighbors),
\`graphify path "<A>" "<B>"\` (how two things connect).
Faster and more complete than cold grep; fall back to grep only when the
graph doesn't answer.

TDD here is enforced mechanically (edit-time guard where installed; commit
gates during gated builds). Cosmetic/styling-only changes are refactor-class:
no new tests required, never geometry assertions — verify by looking.

Output discipline (binds every reply in this session, including the main
chat): Lead with the outcome in the first sentence. Match length to the
question — a quick fact gets a sentence. Forbidden: no preamble ("I'll
now…"), no restating the question, no narrating completed steps,
no closing summary repeating anything said above it, no walls of text. Findings and
verification evidence are exempt — brevity forbids padding, not substance.

Anti-spiral rule: after 3 failed attempts at the same tool/framework/
environment problem, STOP guessing and research online (WebSearch — issue
trackers, docs, prior art) before attempt 4. Someone has hit it before.

This card is a pointer, not a summary — read the skill before following it.
Standing rules live in .claude/rules/.`

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** No version-comparison / migration nudge: installed rules/templates are static
 * suggestions written once at setup, never reconciled against a plugin version. */
export function setupNudge(cwd?: string): string {
  if (!cwd) return ''
  const configPath = join(cwd, '.argo', 'config.json')
  if (!existsSync(configPath)) {
    return `\n\nSETUP: argo is installed but this project isn't set up — run /argo:init (stack detection + adapted rules, per-item consent).`
  }
  return ''
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    process.exit(0)
  }
  let hook: any
  try {
    hook = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  if (hook?.hook_event_name !== 'SessionStart') process.exit(0)

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: CARD + setupNudge(hook.cwd)
      }
    })
  )
  process.exit(0)
}

main()
