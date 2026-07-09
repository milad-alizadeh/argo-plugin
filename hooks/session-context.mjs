#!/usr/bin/env node
/**
 * session-context — SessionStart hook: inject a compact "argo way of working"
 * card as additionalContext at the start of every session.
 *
 * The card is a POINTER to skills/agents, never a summary of their content —
 * a description that summarizes a workflow becomes a shortcut agents take
 * instead of reading the skill. Hard budget: ≤600 tokens (~2400 chars),
 * enforced by test. Stack-agnostic wording only: project specifics belong to
 * init's installed rules, not this card.
 *
 * Fail-open by design: malformed stdin or a non-SessionStart event exits 0
 * with no output — this runs at every session boot in every host project.
 */

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

Anti-spiral rule: after 3 failed attempts at the same tool/framework/
environment problem, STOP guessing and research online (WebSearch — issue
trackers, docs, prior art) before attempt 4. Someone has hit it before.

This card is a pointer, not a summary — read the skill before following it.
Standing rules live in .claude/rules/.`

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lifecycle nudge: point an installed-but-not-set-up project at /argo:init.
 * State lives in .argo/config.json (the consolidated config). There is no
 * version-comparison / migration nudge — the plugin's real logic lives in the
 * versioned @argohq/toolkit, so a project's installed rules/templates are static
 * suggestions written once at setup, never reconciled against a plugin version.
 * A legacy argo-config.json is deliberately NOT read (no-legacy ruling).
 */
function setupNudge(cwd) {
  if (!cwd) return ''
  const configPath = join(cwd, '.argo', 'config.json')
  if (!existsSync(configPath)) {
    return `\n\nSETUP: argo is installed but this project isn't set up — run /argo:init (stack detection + adapted rules, per-item consent).`
  }
  return ''
}

function main() {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    process.exit(0)
  }
  let hook
  try {
    hook = JSON.parse(raw)
  } catch {
    process.exit(0) // malformed stdin — inert
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
