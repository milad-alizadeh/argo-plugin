# argo — a portable engineering "way of working" for Claude Code

Opinionated but **non-breaking**: safe to drop into an existing project, an
excellent default for a greenfield one, and as project-agnostic as possible.
Works in any Claude Code project, **with or without** the Argo cockpit.

## The end-to-end pipeline

For the whole path a feature travels — **thought → PRD → brief → wireframe →
freeze → hi-fi → sync → code → ship**, the two seams that join the design and
code loops, and the "re-enter at the altitude of the change" rule for later
edits — see **[PIPELINE.md](PIPELINE.md)**. It is the map of how every skill and
agent below fits together.

## Install

Add the marketplace and enable the plugin (per-project or globally):

```
/plugin marketplace add <path-or-repo-to-this-plugin>
/plugin install argo@argo
```

Then run the **`init`** skill once to adapt the opinionated rules to your
stack (see "How opinionation is delivered" below). It delegates the deterministic
half — placing the `@argohq/kit` dependency, `.claude/settings.json`, the
`.claude/argo.json` skeleton — to the kit's own `argo init` CLI verb (dispatched
via `npx --no @argohq/kit`); without the kit installed, every gated hook fails
closed and names the fix (`bun install` or `/argo:init`).

**Auto-update (recommended):** third-party marketplaces don't auto-update by
default. Either toggle "Enable auto-update" on the argo marketplace in
`/plugin` → Marketplaces, or set it in `~/.claude/settings.json`:

```json
"extraKnownMarketplaces": {
  "argo": {
    "source": { "source": "github", "repo": "milad-alizadeh/argo-plugin" },
    "autoUpdate": true
  }
}
```

With that on, Claude Code refreshes the marketplace at startup, updates the
plugin, and prompts `/reload-plugins` when a new version landed. Without it,
update manually: `claude plugin update argo@argo`. Either way, the plugin's
SessionStart nudge tells each set-up project when its `.claude/` or design-pack
setup is older than the installed plugin. To pick up the deltas, run
**`/argo:update`** — it runs every setup skill in update mode (given the
project's current state, without re-running the first-time wizard) and checks
plugin/kit lockstep via `argo doctor`; there are no migrations — plugin and kit
carry zero backward compatibility, so a project whose on-disk state predates a
breaking change is rip-and-re-init (`/argo:init` fresh), not converted. Run
`/argo:init` / `/argo:setup-design` directly to reconcile just one surface.

## What ships active (loads when the plugin is enabled)

- **Agents** (`agents/`) — full lifecycle roles, invoked on demand:
  `product → scaffolder → planner → builder → reviewer → debugger`, plus
  `auditor` (whole-codebase health), `integrator` (lands work / PRs / docs
  sync), `designer` (executes the Figma-to-code design pack's skills inside
  a live Figma file), and `design-verifier` (independent, adversarial
  completeness check on a built screen — the P5 gate of `/argo:build-design`).
  `product` sits at the very top of the loop — it turns a
  raw feature idea into a lightweight, grounded PRD (the durable WHAT/WHY) that
  every stage after it cites.
- **Skills** (`skills/`) — on-demand disciplines and methodology, twenty-two:
  `write-prd` (product intent at the top of the loop), `build-design` (the
  design analog of build-plan — contract-gated hands-off screen build),
  `engineering-principles`,
  `test-first`, `build-plan`, `root-cause`,
  `grill-me`, `spike`, `scaffold`, `session-handoff`, `finish-branch`,
  `author-skill`, `init`, `update`, `orchestrate`, and the Figma-to-code
  design pack — `setup-design`, `figma-audit`, `figma-sync`, `figma-create`,
  `figma-wireframe`, `figma-to-code`, `design-upgrade`. The design pack is
  shaped as a
  provider-neutral **mechanism** (tiered gates, the `@argohq/kit/design-kit`
  subpath) plus swappable **recipes** under `templates/design/recipes/`
  that own everything design-source- and code-target-specific (kit sync,
  lint rules, token writer) — one recipe ships today,
  `shadcn-tailwind-external-kit`.
- **Hooks** (`hooks/`) — two kinds, split by where they run:
  - *Plugin-side safety guardrails (always on, run verbatim from this
    directory):* `block-designer-spawn.mjs` — blocks the `designer` agent
    being spawned outside a live Figma session; `block-dangerous-git.sh` —
    blocks destructive git commands (opt out with `ARGO_DISABLE_GIT_GUARD=1`);
    `check-pipe-to-shell.mjs` — blocks piping remote content into a shell;
    `block-lockfile-edit.mjs` — blocks hand-edits to lockfiles (use the
    package manager); `block-bash-source-write.mjs` — blocks writing source
    files via shell (heredoc/`>`/`tee`/`sed -i`/`cp`), so edits go through
    Write/Edit where the guards see them (opt out with
    `ARGO_DISABLE_BASH_SOURCE_GUARD=1`); `session-context.mjs` — injects a
    compact (~600-token) "argo way of working" card at session start.
  - *Kit-dispatched gates, invoked via `npx --no @argohq/kit argo-hook
    <name>` and fail-closed (exit 2, naming `bun install` / `/argo:init`)
    when the kit isn't installed:* `red-proof-gate` / `trust-gate` — block a
    commit without a fresh fail-then-pass test receipt / launch evidence,
    armed only during a `/argo:build-plan` run via `.argo/build-mode.json`
    (delete it and they go quiet); `design-commit-gate` /
    `design-coverage-gate` — enforce tier-0 audit receipts and fresh
    passing spec-diff/coverage receipts, armed per-app by `.claude/argo.json`
    `design` blocks; `format-on-write` / `test-smell` — auto-format every
    file Claude edits/writes with the project's own formatter and flag
    smelly test edits (e.g. assertions weakened to force a pass), always on;
    `design-guard-record` / `design-guard-stop` — track live Figma tool use
    and fire the design gates at session/subagent stop.

Only agent/skill **descriptions** load into context until a role/skill is
invoked — the pack is ~1.6k tokens always-on.

## How opinionation is delivered (rules are inert until adapted)

Claude Code has no plugin-level `rules/` mechanism, and shipping always-on rules
would impose conventions on projects that don't share them. So opinionated rules
ship **inert** under `templates/` — **not** a Claude Code component directory, so
Claude Code never auto-loads it. The **`init`** skill detects the host
project's stack and writes *adapted, correctly-scoped* rules into the project's
own `.claude/rules/`, with your consent. Greenfield: defaults on. Brownfield:
offered, never imposed.

> **Do not move `templates/` under `skills/`, `rules/`, or `agents/`.** It is
> deliberately an unrecognized directory so it stays inert. `init` reads
> from it; Claude Code must not.

`graphify` integration is conditional: if the [graphify](https://pypi.org/project/graphifyy/)
CLI is present, `init` runs `graphify install --platform claude` so
graphify installs *its own* maintained skill — the plugin does not vendor a copy.

## Agents: standalone + Argo dual mode

Every agent runs **standalone** in any terminal — its body is a complete system
prompt. When invoked through the Argo cockpit, a runtime seed (the task, worktree
path, an approved plan if one exists, and a structured deliverable target) is
appended after the body; the instructions are identical in both cases. Standalone,
an agent reports inline; under Argo it also reports through structured hooks.

## Portability — opinionated about process, agnostic about stack

The contract in one line: **argo is opinionated about the way of working (the
canonical loop, test-first, hook-enforced gates) and agnostic about your
stack.** The core — agents, skills, and hooks — names no language, framework,
or package manager; project specifics enter through exactly one door:
`init`, which detects your stack and installs adapted rules,
placeholders, and config (e.g. `.claude/argo-source-extensions.json` for the
source-write guard, and `.claude/argo.json` with `"landing": "pr" |
"merge"` — team-PR flow vs solo direct-merge landing) with per-rule consent. Hooks that lean toward one stack
today are disclosed as dormant during setup rather than pretending to cover
everything. If you find a hardcoded command or a stack assumption anywhere
outside `init`, that's a portability bug — file it.

**Ejectability:** everything here is stock Claude Code plus this plugin. The
Argo desktop app is an optional UI/voice layer on top — it observes, it never
owns the loop. At any point you can drop the app and drive the identical
gates, guards, and skills from a bare `claude` terminal in any project.

## After installing on a new project

1. Run **`/argo:init`** — it detects your stack, installs the adapted
   rules with per-rule consent, places the `@argohq/kit` dependency and
   `.claude/argo.json`, wires the gated-build receipts, and (where a
   supported test runner exists) offers tdd-guard.
2. Confirm the hooks are live: start a fresh session and you should see the
   argo way-of-working card; a `git commit` in a normal (non-build) repo is
   unaffected — the build gates arm only during `/argo:build-plan`. If
   `@argohq/kit` isn't installed yet, the kit-dispatched hooks fail closed and
   name the fix (`bun install`) rather than silently no-opping.
3. Optional: if init wired tdd-guard, `tdd-guard off` / `tdd-guard on`
   toggle it mid-session. Either way, know that the commit gates block only
   during a gated build, never your everyday commits.
4. The loop, in six lines: `argo:product` (`/argo:write-prd`) the WHAT/WHY ·
   `/argo:scaffold` a new app · `/argo:grill-me` a
   design · `argo:planner` a plan · `/argo:build-plan` to build it hands-off ·
   `argo:reviewer` / `/argo:root-cause` / `argo:integrator` to review, debug,
   and land.
5. No Argo app required for any of the above — any terminal, any editor, works.
