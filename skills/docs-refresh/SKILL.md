---
name: docs-refresh
description: Refresh AI-owned docs pages that a human may have edited since the last generation. Use when the user says "refresh the docs" / "sync docs with AI" / "/argo:docs-refresh".
---

# Docs Refresh

Resolves the **human-edited set** — manifest-tracked prose pages whose content has
diverged from their last AI-generated hash. AI-owned pages (hash still matching) are
explicitly OUT of scope here: they're already handled automatically by the
integrator's doc-sync step. Re-touching them in this skill would be redundant work
against the same manifest.

## 1. Find the edited set

Read the project's `.argo/docs-manifest.json` and call
`apps/docs/scripts/docs-manifest.mjs`'s `listEditedPages(manifest, readCurrentContent)`
— every tracked page whose on-disk content no longer hashes to its recorded value.

If the set is empty, report that and stop — nothing to refresh.

## 2. One prompt per page

For each edited page, one **AskUserQuestion** — never a single batch "refresh all
edited pages?" — per the design's page-granularity: a human may want to keep one
page's edits while refreshing another in the same run.

> `<page path>` was edited since it was last AI-generated. Refresh it with AI? It
> will be regenerated under the project's documentation-style and
> documentation-content rules, and your edits will be overwritten.

- **Yes** → regenerate that one page's prose, grounded in the facts
  inventory (`.argo/design/docs-facts.md`) per the project's
  `documentation-content.md` rule. If the inventory is missing or predates
  HEAD by enough that its facts may have drifted, refresh the relevant
  inventory sections from source FIRST — **never regenerate from the
  previous, possibly stale, version of the page itself, and never from
  surface artifacts (README, frontmatter) alone**; both drift the same way a
  from-scratch draft could. Write the file, then call `recordGenerated` to
  re-hash and re-record it as AI-owned in the manifest.
- **No** → leave the file untouched. Call `markHumanOwned(path, manifest)` so
  routine doc-sync (the integrator, and this skill's own next run) stops
  surfacing it.

## 3. Report

Summarize: pages refreshed, pages marked human-owned, pages left untouched pending a
future run (none, by construction — every edited page gets a yes/no this run).
