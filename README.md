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

## What ships active (loads when the plugin is enabled)

- **Agents** (`agents/`) — full lifecycle roles, invoked on demand:
  `scaffolder → planner → builder → reviewer → debugger`, plus `auditor`
  (whole-codebase health), `integrator` (lands work / PRs), `documenter`.
- **Skills** (`skills/`) — on-demand disciplines: `engineering-principles`,
  `test-first`, `root-cause`, `grill-me`, `spike`, `session-handoff`,
  `author-skill`, `terse-mode`, and `setup-claude`.
- **Hooks** (`hooks/`) — safety-only guardrails: block destructive git
  (opt out with `ARGO_DISABLE_GIT_GUARD=1`) and block pipe-to-shell.

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
