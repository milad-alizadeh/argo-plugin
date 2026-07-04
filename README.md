# argo — a portable engineering "way of working" for Claude Code

Opinionated but **non-breaking**: safe to drop into an existing project, an
excellent default for a greenfield one, and as project-agnostic as possible.
Works in any Claude Code project, **with or without** the Argo cockpit.

## Install

Add the marketplace and enable the plugin (per-project or globally):

```
/plugin marketplace add <path-or-repo-to-this-plugin>
/plugin install argo@argo
```

Then run the **`setup-claude`** skill once to adapt the opinionated rules to your
stack (see "How opinionation is delivered" below).

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
**`/argo:update`** — it runs every setup skill in update mode plus any pending
migrations (given the project's current state, without re-running the
first-time wizard); or run `/argo:setup-claude` / `/argo:setup-design` directly
to reconcile just one surface.

## What ships active (loads when the plugin is enabled)

- **Agents** (`agents/`) — full lifecycle roles, invoked on demand:
  `scaffolder → planner → builder → reviewer → debugger`, plus `auditor`
  (whole-codebase health) and `integrator` (lands work / PRs / docs sync).
- **Skills** (`skills/`) — on-demand disciplines and methodology, nineteen:
  `engineering-principles`, `test-first`, `build-plan`, `root-cause`,
  `grill-me`, `spike`, `scaffold`, `session-handoff`, `finish-branch`,
  `author-skill`, `setup-claude`, `update`, `orchestrate`, and the Figma-to-code
  design pack — `setup-design`, `figma-audit`, `figma-sync`, `figma-create`,
  `figma-to-code`, `design-upgrade`. The design pack is shaped as a
  provider-neutral **mechanism** (tiered gates, the `figma-design-kit`
  package) plus swappable **recipes** under `templates/design/recipes/`
  that own everything design-source- and code-target-specific (kit sync,
  lint rules, token writer) — one recipe ships today,
  `shadcn-tailwind-external-kit`.
- **Hooks** (`hooks/`) — nine hooks in four categories:
  - *Safety guardrails (always on):* `block-dangerous-git.sh` — blocks
    destructive git commands (opt out with `ARGO_DISABLE_GIT_GUARD=1`);
    `check-pipe-to-shell.mjs` — blocks piping remote content into a shell;
    `block-lockfile-edit.mjs` — blocks hand-edits to lockfiles (use the
    package manager); `block-bash-source-write.mjs` — blocks writing source
    files via shell (heredoc/`>`/`tee`/`sed -i`/`cp`), so edits go through
    Write/Edit where the guards see them (opt out with
    `ARGO_DISABLE_BASH_SOURCE_GUARD=1`).
  - *Self-scoping build gates (armed only during a `/argo:build-plan` run,
    inert otherwise — installing the pack never gates a normal commit):*
    `red-proof-gate.mjs` — blocks a commit without a fresh fail-then-pass
    test receipt for the current slice; `trust-gate.mjs` — blocks a commit
    on a `requiresLaunch: true` slice without fresh launch evidence. Both
    read `.argo/build-mode.json` at the repo root; delete it and they go quiet.
  - *Write hygiene (always on):* `format-on-write.mjs` — auto-formats every
    file Claude edits/writes with the project's own formatter;
    `test-smell.mjs` — flags smelly test edits (e.g. assertions weakened to
    force a pass) after they're written.
  - *Session start:* `session-context.mjs` — injects a compact (~600-token)
    "argo way of working" card so every session knows the loop and to check
    skills before improvising.

Only agent/skill **descriptions** load into context until a role/skill is
invoked — the pack is ~1.6k tokens always-on.

## How opinionation is delivered (rules are inert until adapted)

Claude Code has no plugin-level `rules/` mechanism, and shipping always-on rules
would impose conventions on projects that don't share them. So opinionated rules
ship **inert** under `templates/` — **not** a Claude Code component directory, so
Claude Code never auto-loads it. The **`setup-claude`** skill detects the host
project's stack and writes *adapted, correctly-scoped* rules into the project's
own `.claude/rules/`, with your consent. Greenfield: defaults on. Brownfield:
offered, never imposed.

> **Do not move `templates/` under `skills/`, `rules/`, or `agents/`.** It is
> deliberately an unrecognized directory so it stays inert. `setup-claude` reads
> from it; Claude Code must not.

`graphify` integration is conditional: if the [graphify](https://pypi.org/project/graphifyy/)
CLI is present, `setup-claude` runs `graphify install --platform claude` so
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
`setup-claude`, which detects your stack and installs adapted rules,
placeholders, and config (e.g. `.claude/argo-source-extensions.json` for the
source-write guard, and `.claude/argo-config.json` with `"landing": "pr" |
"merge"` — team-PR flow vs solo direct-merge landing) with per-rule consent. Hooks that lean toward one stack
today are disclosed as dormant during setup rather than pretending to cover
everything. If you find a hardcoded command or a stack assumption anywhere
outside `setup-claude`, that's a portability bug — file it.

**Ejectability:** everything here is stock Claude Code plus this plugin. The
Argo desktop app is an optional UI/voice layer on top — it observes, it never
owns the loop. At any point you can drop the app and drive the identical
gates, guards, and skills from a bare `claude` terminal in any project.

## After installing on a new project

1. Run **`/argo:setup-claude`** — it detects your stack, installs the adapted
   rules with per-rule consent, wires the gated-build receipts, and (where a
   supported test runner exists) offers tdd-guard.
2. Confirm the hooks are live: start a fresh session and you should see the
   argo way-of-working card; a `git commit` in a normal (non-build) repo is
   unaffected — the build gates arm only during `/argo:build-plan`.
3. Optional: if setup-claude wired tdd-guard, `tdd-guard off` / `tdd-guard on`
   toggle it mid-session. Either way, know that the commit gates block only
   during a gated build, never your everyday commits.
4. The loop, in five lines: `/argo:scaffold` a new app · `/argo:grill-me` a
   design · `argo:planner` a plan · `/argo:build-plan` to build it hands-off ·
   `argo:reviewer` / `/argo:root-cause` / `argo:integrator` to review, debug,
   and land.
5. No Argo app required for any of the above — any terminal, any editor, works.
