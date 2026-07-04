---
name: figma-audit
description: Run the canonical tier-0 Figma hygiene audit against named components (hard gate) or the whole file (advisory sweep). Use when the user asks to audit, check, or lint the Figma file for design-pack hygiene, before figma-sync/figma-create hand off to it internally, or after any Figma-side generation to confirm it's clean.
---

# figma-audit

Owns the **canonical** tier-0 Figma hygiene audit (design-pack plan, X3:
"figma-audit owns the canonical audit script; sync/create call it" — there is
exactly one copy of this logic, never a second divergent one).

**Mandatory prerequisite:** load `figma:figma-use` first — this skill's every
check runs by executing `templates/design/tier0-audit.js` inside Figma's
Plugin API sandbox via `use_figma`; skipping that skill causes the usual
hard-to-debug `use_figma` failures.

## What it checks (figma-to-code-pipeline.md §5 tier 0)

Unbound fills/strokes/radii/type, non-Semantic bindings (distinguished by
library source, §8), missing Auto Layout, detached instances, non-semantic
names, D18 variant naming (`Size`→`size`, Title-Case→lowercase), missing or
incorrect dark copy for **components only** (D11), explicit line-height
(D20), node-scoped story URLs (`?node-id=`, D1/C13), and edits to the kit
copy not present in `design/kit-patches.json`.

## Two modes

1. **Named-component audit (hard gate, D8)** — when called with specific
   component names (by `figma-sync`, `figma-create`, or the user), any
   violation on those components **fails loud**. This is the mode other
   skills depend on — never soften it to advisory.
2. **File-wide sweep (advisory)** — when run standalone with no component
   names, walks every top-level frame on every page and reports violations
   as **advisory** findings (un-synced frames, stray hygiene issues) — it
   informs, it doesn't block anything on its own.

## Procedure

1. Load `figma:figma-use`.
2. Locate `templates/design/tier0-audit.js` — read it from the host
   project's `design/` dir if `setup-design` has already installed it there
   (with its `{{…}}` slots filled from `design/config.json`), otherwise read
   the plugin's own template copy directly (running before install is
   supported — the caller is expected to fill in the two slots,
   `{{SEMANTIC_COLLECTION_NAME}}` and `{{KIT_LIBRARY_FILE_KEY}}`, from
   whatever config is available, or ask the user).
3. Execute it via `use_figma`, passing `{ componentNames: [...] }` for a
   named audit or `{}` for a file-wide sweep.
4. Report violations grouped by `severity`. For a named audit with any
   `hard` violation: **fail loud** — list every violation with its
   `nodeId`/`nodeName`/`rule`/`detail`, and do not report success. For an
   advisory sweep: summarize counts by rule, list the worst offenders.

## Cannot be tested outside Figma

This skill's core logic is a stated, accepted gap in this repo's own test
suite (design-pack plan §6, risk 1) — `tier0-audit.js` only executes inside
Figma's Plugin API sandbox. First real proof is a live run against an actual
Figma file (argo-v2 Phase B). Do not invent a synthetic harness for it here.
