---
name: setup-claude
description: Detect the host project's stack and install ADAPTED argo rules into the project's own .claude/, tailored to what's there and never imposed. Use once when adding the argo pack to a project, or when the user says "set up argo" / "configure argo for this project" / "adapt the rules to my stack".
---

# Set Up Argo in This Project

The argo plugin ships opinionated rules as **inert templates** under
`${CLAUDE_PLUGIN_ROOT}/templates/` — never as active rules — so installing the pack
imposes nothing. This skill turns those templates into **adapted, correctly-scoped
rules in the host project's `.claude/`**, matched to the stack that's actually there.

**Core principle:** opinionated, never imposing. Detect what's real, propose with a
reason, ask before writing, never overwrite what the user hand-wrote.

## 1. Refuse to clobber
If `.claude/rules/` already has argo-managed rules, switch to update/diff mode —
show what would change and ask. Never overwrite a hand-authored file.

## 2. Detect the stack (read-only, evidence-based)
From manifests/lockfiles/config, determine and cite evidence for: language(s) (TS vs
JS); UI framework + whether a components dir exists; styling system + the **real
token source file**; test runner + e2e tool + the real `lint`/`test` commands; the
**observed** file-naming/folder convention (sample real names — don't impose);
**monorepo layout** (workspaces in `package.json` / `pnpm-workspace.yaml` /
`turbo.json` / multiple `apps/*`|`packages/*`); whether the `graphify` CLI is present.

## 3. Classify greenfield vs brownfield
Empty/near-empty repo → greenfield: defaults ON. Substantial existing tree →
brownfield: defaults OFF, opinionation offered, never imposed.

## 4. Propose, don't impose
Present a table: each candidate rule → install? → the detected fact that justifies
it. Flag conflicts concretely and get **explicit per-rule consent**.

## 5. Install adapted rules
For each accepted template, instantiate it with detected values and a correct
`paths:` glob — see `templates-reference.md` for the per-template mapping. Optionally
install convention hooks into the project's own `.claude/` (also per the reference).

## 6. graphify (conditional) + monorepo
Only if the `graphify` CLI is present: run `graphify install --platform claude` so
graphify installs **its own** maintained skill (don't vendor one), and copy
`deepen-architecture` from `${CLAUDE_PLUGIN_ROOT}/templates/skills/` into
`.claude/skills/`. **Monorepo:** `graphify .` at the root doesn't handle workspaces
well — instead build **one graph per workspace** (`graphify <each app/package dir>`),
then optionally a merged root via `graphify merge-graphs` for cross-workspace
questions. Record in CLAUDE.md which graph covers which area so agents query the
right one. If graphify is absent, skip silently — the active skills degrade to plain
read/grep.

## 7. Write stack-facts + canonical loop into CLAUDE.md
Record the detected commands/paths (so skills/agents use real values, not
placeholders) and the canonical loop: **scaffold → grill → plan → test-first build →
review → debug → handoff.**

## 8. Report + one-step revert
List exactly what was written where, and how to re-run or revert. Be idempotent;
every file this skill writes must be removable in one step.
