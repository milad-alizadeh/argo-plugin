---
name: update
description: Reconcile an already-initialized project against the CURRENT argo plugin version — run every argo setup skill in update mode, given the project's current on-disk state. Use when the user says "update argo", "sync the design pack", "pick up the latest argo fixes", "reconcile my project with the plugin", "bring this project up to date with argo", or "/argo:update" — i.e. the plugin was updated and an already-set-up project needs the corresponding changes applied without re-running the first-time wizard.
---

# Update an already-initialized project to the current argo pack

A thin umbrella over the setup skills' own update modes — it does **not**
duplicate their wizard logic. Use it when the plugin has moved forward
(a fix landed) and a project that already ran setup needs the deltas applied.
For a brand-new project use `/argo:scaffold` + `/argo:init` +
`/argo:setup-design` instead.

There are **no migrations** — plugin and kit are unshipped with zero backward
compatibility (owner ruling): nothing detects or converts prior-version data
shapes, ever. If a project's on-disk state predates a breaking change, the
answer is rip-and-re-init (`/argo:init` fresh), not a migration.

## 1. Version handshake — bidirectional lockstep via `argo doctor`

- `.claude/argo.json` → `setupVersion` (the /argo:init surface).
- `design/config.json` → `_meta.setupVersion` (the design-pack surface).
  Absent → the design pack was never installed here; skip everything
  design-related silently.

Read the plugin's current version from its own `.claude-plugin/plugin.json`
(never hardcode). Then run the kit/plugin lockstep check:

```
npx --no @argohq/kit argo doctor --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

`argo doctor` asserts the plugin manifest's `designLibrary` major.minor
**equals** the installed `@argohq/kit` version's major.minor exactly — never a
range-contains check — and fails loud naming the exact fix for whichever side
is behind: kit behind → `bun update @argohq/kit`; kit ahead of what the plugin
declares → `claude plugin update argo@argo`. Resolve a doctor failure BEFORE
touching any managed file. (In the dev bun-link phase the linked kit tracks
the plugin repo checkout, so a mismatch usually means the plugin cache and the
linked repo have drifted — update whichever side doctor names.)

If both setup surfaces are already at the current version and doctor is green,
say so and exit — nothing to do.

## 2. Run the deterministic half — `argo update`

```
npx --no @argohq/kit argo update --host-root "<abs repo root>"
```

It re-emits `.claude/argo.json`'s skeleton defaults while preserving every
user-edited field (mergeConfigShape) and reports `addedKeys`. The dev-phase
`link:@argohq/kit` dep line is version-less — nothing to bump; after a
published release, swapping `link:` → `^version` is a normal dep edit, not
this skill's job.

## 3. Run each setup skill's update mode

In order:

1. `/argo:init` — its §1 entry mode detects the stale `setupVersion`
   and reconciles its managed surface (rules, hooks, tdd-guard instructions),
   diff-per-file with consent, hand-edit-protected.
2. `/argo:setup-design` — its §0d entry mode + §5a per-category reconcile
   (templates re-derived, `design/config.json` shape-merged, generated files
   like walker shims re-emitted, foreign-file edits re-applied idempotently).

## 4. Report

Summarize what each phase did: doctor verdict, `argo update`'s `addedKeys`,
files updated vs. skipped (and any hand-edit conflicts surfaced),
`design/config.json` `addedKeys`. State plainly that this was a convenience
umbrella — running `/argo:init` or `/argo:setup-design` directly does the same
for its own surface, and each stamps its own `setupVersion` when done.
