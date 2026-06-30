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

## 6. graphify (conditional) — treat the graph as local build cache
Only if the `graphify` CLI is present: run `graphify install --platform claude`
(graphify installs its **own** maintained skill — don't vendor one) and copy
`deepen-architecture` from `${CLAUDE_PLUGIN_ROOT}/templates/skills/` into
`.claude/skills/`.

**Gitignore the churn; commit the labels.** The graph splits into two artifacts with
opposite economics: **structure** (`graph.json`/`GRAPH_REPORT.md`/`graph.html`) is
large, churny, and cheap to rebuild from code (AST, no LLM); **community labels**
(`.graphify_labels.json`) are small, stable, **LLM-produced** — the expensive part,
and what makes the graph queryable for Claude (you query "the auth community", not
"Community 7"). Committing the churny files from parallel worktrees is a
merge-conflict factory; gitignoring the *labels* would force re-paying LLM cost (or
navigating unlabeled) on every checkout. So split them:

- **Commit `.graphify_labels.json`; gitignore the rest** of `graphify-out/`:
  ```
  **/graphify-out/*
  !**/graphify-out/.graphify_labels.json
  ```
- **Per-workspace graphs** (a single root `graphify .` handles workspaces poorly):
  `graphify <each app/package dir>` → `<ws>/graphify-out/`. The first build runs the
  full LLM pass to seed labels (committed).
- **Rebuild locally** (SessionStart step, auto-discovering workspaces by a present
  `graphify-out/`): `graphify update <ws>` rebuilds structure with **no LLM** and
  **re-attaches the committed labels** — every fresh checkout/worktree is labeled at
  zero LLM cost; only genuinely-new communities show as placeholders. No
  post-commit/post-merge/merge-driver (the fragile machinery: husky's relative
  `core.hooksPath` doesn't fire in worktrees, `graphify update` never commits,
  union-merging JSON corrupts silently).
- **Naming new communities = single writer:** `integrator`/CI runs `graphify label
  --missing-only` after integration on main and commits the updated
  `.graphify_labels.json`. Worktrees never write it in parallel → no conflicts.

If graphify is absent, skip silently — the active skills degrade to plain read/grep.

## 7. Write stack-facts + canonical loop into CLAUDE.md
Record the detected commands/paths (so skills/agents use real values, not
placeholders) and the canonical loop: **scaffold → grill → plan → test-first build →
review → debug → handoff.**

## 8. Report + one-step revert
List exactly what was written where, and how to re-run or revert. Be idempotent;
every file this skill writes must be removable in one step.
