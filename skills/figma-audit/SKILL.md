---
name: figma-audit
description: Run the canonical tier-0 Figma hygiene audit against named components (hard gate) or the whole file (advisory sweep). Use when the user asks to audit, check, or lint the Figma file for design-pack hygiene, before figma-sync/figma-create hand off to it internally, or after any Figma-side generation to confirm it's clean.
---

# figma-audit

Owns the **canonical** tier-0 Figma hygiene audit (design-pack plan, X3:
"figma-audit owns the canonical audit script; sync/create call it" — there is
exactly one copy of this logic, never a second divergent one). That one
copy is an **assembled** script (F12): the mechanism's `tier0-audit.js` with
the installed recipe's `tier0-recipe-checks.js` spliced into its
`// {{RECIPE_TIER0_CHECKS}}` marker — one script, one severity-grouped
report, never two separately-executed audit scripts.

**Mandatory prerequisite:** load `figma:figma-use` first — this skill's every
check runs by executing a **bundled** copy of `templates/design/tier0-audit.js`
inside Figma's Plugin API sandbox via `use_figma`; skipping that skill causes
the usual hard-to-debug `use_figma` failures.

## What it checks (figma-to-code-pipeline.md §5 tier 0)

**Mechanism checks (every recipe):** unbound fills/strokes/radii/type,
missing Auto Layout, detached instances, non-semantic names, D18 variant
naming (`Size`→`size`, Title-Case→lowercase), missing or incorrect mode copy
for **components only** (D11, generalized to mode copies, 2026-07-05: one
copy per Semantic-collection mode beyond the default; a single-mode
collection passes vacuously, zero copies required), explicit line-height
(D20), node-scoped story URLs (`?node-id=`, D1/C13).

**Recipe checks (installed recipe only):** for `shadcn-tailwind-external-kit`
— non-Semantic bindings (distinguished by library source, §8),
retired-file-key bindings (a stale binding left over from a Library Swap),
and edits to the kit copy not present in `design/kit-patches.json`. A
different recipe (or `baseSource: none`) supplies its own check set, or
none at all.

## Two modes

1. **Named-component audit (hard gate, D8)** — when called with specific
   names (by `figma-sync`, `figma-create`, or the user), any violation on
   those nodes **fails loud**. Matches by name against COMPONENT,
   COMPONENT_SET, FRAME, and SECTION nodes — not components only, so a
   SCREEN or foundation frame (e.g. `foundations/sticker-sheet`) can be
   named-audited too, which `figma-create`'s own flow requires as a hard
   gate. This is the mode other skills depend on — never soften it to
   advisory.
2. **File-wide sweep (advisory)** — when run standalone with no component
   names, walks every top-level frame on every page and reports violations
   as **advisory** findings (un-synced frames, stray hygiene issues) — it
   informs, it doesn't block anything on its own.

## Procedure

1. Load `figma:figma-use`.
2. Locate the **assembled** `tier0-audit.js` — read it from the host
   project's `design/` dir if `setup-design` has already installed and
   assembled it there (mechanism + the installed recipe's
   `tier0-recipe-checks.js` spliced in, all `{{…}}` slots filled from
   `design/config.json`). If running before install (no host project has it
   yet), assemble the same way ad hoc from the plugin's own template copies:
   splice `templates/design/recipes/<recipe>/design-source/tier0-recipe-checks.js`
   into the mechanism template's `// {{RECIPE_TIER0_CHECKS}}` marker,
   filling `{{SEMANTIC_COLLECTION_NAME}}` (mechanism) and the recipe's own
   slots (e.g. `{{KIT_LIBRARY_FILE_KEY}}`) from whatever config is
   available, or ask the user. Never run the mechanism script alone and
   call it complete — a recipe's checks are part of the canonical audit,
   not an optional extra.
2a. **Bundle it before execution — never paste the assembled module into
   `use_figma` as-is.** The assembled module's top-level `import`s (from the
   vendored `figma-design-kit`/`figma-design-kit-shadcn-tailwind` packages
   and the recipe's `./kit-patches.json`) cannot resolve inside the sandbox —
   there is no module resolution there, only one self-contained script.
   Run `bundleTier0Audit` from `${CLAUDE_PLUGIN_ROOT}/scripts/assemble-tier0-audit.mjs`
   against the assembled source, with `cwd` set to the directory the module
   was assembled into (so the recipe's relative `./kit-patches.json` import
   resolves) — it shells out to `bun build --bundle --format=esm`, restores
   the mechanism's bare-completion-value ending (a naive tree-shake would
   otherwise discard the whole audit body as "unused"), and verifies the
   result has zero `import`/`export` statements and is under `use_figma`'s
   50,000-char cap. Paste THAT bundled output into `use_figma`, never the
   source module.
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
