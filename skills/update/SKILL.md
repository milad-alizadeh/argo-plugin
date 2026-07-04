---
name: update
description: Reconcile an already-initialized project against the CURRENT argo plugin version — run every argo setup skill in update mode plus any pending migrations, given the project's current on-disk state. Use when the user says "update argo", "sync the design pack", "pick up the latest argo fixes", "reconcile my project with the plugin", "bring this project up to date with argo", or "/argo:update" — i.e. the plugin was updated and an already-set-up project needs the corresponding changes applied without re-running the first-time wizard.
---

# Update an already-initialized project to the current argo pack

A thin umbrella over the setup skills' own update modes — it does **not**
duplicate their wizard logic. Use it when the plugin has moved forward
(a fix landed) and a project that already ran setup needs the deltas applied.
For a brand-new project use `/argo:scaffold` + `/argo:setup-claude` +
`/argo:setup-design` instead.

## 1. Read the project's recorded state

- `.claude/argo-config.json` → `setupVersion` (the setup-claude surface).
- `design/config.json` → `_meta.setupVersion` (the design-pack surface, §2a
  Option B of `project-reconcile.md`). Absent → the design pack was never
  installed here; skip everything design-related silently.

Read the plugin's current version from its own `.claude-plugin/plugin.json`
(never hardcode). If both surfaces are already at the current version and no
migration is pending, say so and exit — nothing to do.

## 2. Run pending migrations FIRST

Import `pendingMigrations` from `${CLAUDE_PLUGIN_ROOT}/packages/setup-migrations`
and run it against the **lower** of the two recorded versions (a migration may
touch files either skill owns). For each pending migration:

- Show its `description`; ask consent (AskUserQuestion).
- Its `detect`/`computePatch` are pure over the parsed `package.json`; THIS
  skill performs the resulting writes and any vendoring copy, using
  `resolveVendorPlan` (same helper `setup-design` §5 uses) for placement.
- Run the package manager install afterwards so rewritten deps resolve.

Migrations run before the diff-derivation steps below because a stale absolute
`file:` dependency can break `bun install` before either setup skill's update
mode would run cleanly. Every migration is idempotent — a `detect` that
returns false is a silent no-op, so re-running `/argo:update` is always safe.

## 3. Run each setup skill's update mode

In order:

1. `/argo:setup-claude` — its §1 entry mode detects the stale `setupVersion`
   and reconciles its managed surface (rules, hooks, tdd-guard instructions),
   diff-per-file with consent, hand-edit-protected. Unchanged by this skill.
2. `/argo:setup-design` — its §0d entry mode + §5a per-category reconcile
   (templates re-derived, `design/config.json` shape-merged, vendored dirs
   re-copied on a version bump, foreign-file edits re-applied idempotently).

## 4. Report

Summarize what each phase did: migrations applied, files updated vs. skipped
(and any hand-edit conflicts surfaced), `design/config.json` `addedKeys`,
vendored dirs refreshed. State plainly that this was a convenience umbrella —
running `/argo:setup-claude` or `/argo:setup-design` directly does the same
for its own surface, and each stamps its own `setupVersion` when done.
