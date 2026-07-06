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
graphify-out/ directory exists, query the graphify knowledge graph first —
faster and more complete than cold grep.

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
 * Lifecycle nudge: the card knows WHEN to send you through /argo:init.
 * State lives in .claude/argo.json (the consolidated config). A legacy
 * argo-config.json is deliberately NOT read — no-legacy ruling: an
 * old-shape project rips and re-inits, it never migrates.
 */
function setupNudge(cwd) {
  if (!cwd) return ''
  const configPath = join(cwd, '.claude', 'argo.json')
  if (!existsSync(configPath)) {
    return `\n\nSETUP: argo is installed but this project isn't set up — run /argo:init (stack detection + adapted rules, per-item consent).`
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const pluginVersion = JSON.parse(
      readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')
    ).version
    if (!config.setupVersion) {
      return `\n\nSETUP: this project's argo setup predates setup versioning — run /argo:init once to adopt it (adds setupVersion + managedFiles; touches only argo-managed files).`
    }
    if (pluginVersion && config.setupVersion !== pluginVersion) {
      return `\n\nSETUP: this project was set up with argo v${config.setupVersion}; the plugin is now v${pluginVersion} — run /argo:init to review updates (touches only argo-managed files).`
    }
  } catch {
    // Unreadable config or manifest — stay quiet; the card must never break a session.
  }
  return ''
}

/**
 * Design-pack lifecycle nudge — the design pack's state lives in
 * `.claude/argo.json`'s `design.<app>` blocks (a block setup-design stamped a
 * `recipe` into is "set up"; its `_meta.setupVersion`/`managedFiles` are that
 * app's lifecycle state). Silent when no block was ever set up — unlike the
 * init nudge, absence here is not a "you forgot to set up" signal. A legacy
 * `design/config.json` is deliberately NOT read (no-legacy ruling: pre-kit
 * projects rip and re-init).
 */
function designSetupNudge(cwd) {
  if (!cwd) return ''
  const configPath = join(cwd, '.claude', 'argo.json')
  if (!existsSync(configPath)) return ''
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const setUpApps = Object.entries(config?.design ?? {}).filter(
      ([, block]) => typeof block?.recipe === 'string'
    )
    if (setUpApps.length === 0) return '' // design pack not installed — nothing to nudge
    const pluginVersion = JSON.parse(
      readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')
    ).version
    const untracked = setUpApps.find(([, block]) => !block?._meta?.setupVersion)
    if (untracked) {
      return `\n\nSETUP: the design pack for "${untracked[0]}" predates version tracking — run /argo:setup-design to adopt it (adds design.<app>._meta setupVersion + managedFiles; touches only design-pack files).`
    }
    const stale = setUpApps.find(([, block]) => pluginVersion && block._meta.setupVersion !== pluginVersion)
    if (stale) {
      return `\n\nSETUP: the design pack for "${stale[0]}" was set up with argo v${stale[1]._meta.setupVersion}; the plugin is now v${pluginVersion} — run /argo:setup-design to review updates (touches only design-pack files).`
    }
  } catch {
    // Unreadable config or manifest — stay quiet; the card must never break a session.
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
        additionalContext: CARD + setupNudge(hook.cwd) + designSetupNudge(hook.cwd)
      }
    })
  )
  process.exit(0)
}

main()
