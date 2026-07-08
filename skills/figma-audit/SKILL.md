---
name: figma-audit
description: Run the canonical tier-0 Figma hygiene audit against named components (hard gate) or the whole file (advisory sweep). Use when the user asks to audit, check, or lint the Figma file for design-pack hygiene, before figma-sync/figma-create hand off to it internally, or after any Figma-side generation to confirm it's clean.
---

# figma-audit

Owns the **canonical** tier-0 Figma hygiene audit (design-pack plan, X3:
"figma-audit owns the canonical audit script; sync/create call it" — there is
exactly one copy of this logic, never a second divergent one). That one copy
lives in `@argohq/kit` — `design-kit/tier0-audit`'s `runTier0Audit` — and is
never assembled or committed into a host project (kit-extraction restructure:
killed the old splice-into-`design/tier0-audit.js` model, the exact source of
a real drift bug where a kit-side fix didn't reach a project's already-
assembled copy). `bundle-tier0-audit` bundles it fresh, on demand, for every
run; the installed recipe's own check functions (e.g. shadcn-tailwind's
`design-kit/shadcn-tailwind/tier0-walker`) are baked into that SAME bundle by
import, never a second separately-executed script. Project-specific DATA
(the Semantic collection name, the registry's composite names) flows through
the `options` object `prepare-tier0-audit-options` derives, never through a
committed/assembled copy.

**Mandatory prerequisite:** load `figma:figma-use` first — this skill's every
check runs by executing a **bundled** script inside Figma's Plugin API
sandbox via `use_figma`; skipping that skill causes the usual hard-to-debug
`use_figma` failures.

## What it checks (figma-to-code-pipeline.md §5 tier 0)

**Mechanism checks (every recipe):** unbound fills/strokes/radii/type,
missing Auto Layout, detached instances, non-semantic names, D18 variant
naming (`Size`→`size`, Title-Case→lowercase), explicit line-height
(D20), node-scoped story URLs (`?node-id=`, D1/C13), unbound Auto Layout
gap/padding (D24, revised 2026-07-05: every non-zero `itemSpacing`/padding
field must be bound to a Primitives or Semantic spacing variable — unbound
literals, on-scale or not, are violations; a binding to a variable outside
those two collections is also a violation).

**Composite-naming check (Option B, design-first-council-ruling.md Gate
ruling, advisory).** In a composed screen, a plain FRAME named after a
registered composite (`design/registry.json`'s component keys) rather than an
INSTANCE of it is under-decomposition — a traced screen, not one composed
from built components. Always advisory, never the hard authoritative
decomposition gate (Option C, deferred until its brief/story-map schema
lands) — never wire it as a hard-fail.

**Universal a11y/overflow checks (every audited node — no tags, no config).**
Three deterministic per-node rules run alongside the mechanism checks on every
component uniformly: `hug-overflow-horizontal`/`-vertical` (a HUG-sized node
whose child's bounds escape it), `touch-target-too-small` (a node with
prototype `reactions` under 24x24px, WCAG 2.5.8 — interactivity comes from the
node's own reactions, a real Plugin-API signal), and `wcag-contrast-fail`
(text vs the nearest fully-opaque solid ancestor fill, ratio math from the
`wcag-contrast` npm package; 4.5:1 normal / 3:1 for fontSize >= 24). The
contrast check is deterministic-or-skip: an unresolvable background, a
semi-transparent fill, or `figma.mixed` anything means SKIP, never a guessed
violation. There is no separate "geometry pass", no role-tag contract, and no
`geometryCategories` config — the earlier category-scoped row/rail geometry
layer was retired (niche machinery; visual judgment beyond these three rules
belongs to the blind fidelity-verifier).

**Recipe checks (installed recipe only):** for `shadcn-tailwind`
(`@argohq/kit/design-kit/shadcn-tailwind/tier0-walker`)
— the non-Semantic-binding check: every color binding must resolve to a
LOCAL variable in the project's configured Semantic collection (all
variables live in the project's design file — the duplicated starter — so a
remote binding is itself a violation, not something to fail open on), or the
recipe's declared `tw/*` collection family (`tw/gap`, `tw/padding`, `tw/font`,
`tw/stroke-width`, `tw/border-radius`, `tw/border-width`, `tw/margin`,
`tw/space` — a stock kit duplicate deliberately splits non-color tokens
across these instead of folding them into Semantic); gap/padding (D24)
accepts the configured Primitives/Semantic collections or that same `tw/*`
family. No collection name is hardcoded — the Semantic collection name comes
from `argo.json`'s `semanticCollectionName` (a stock kit duplicate never
renames it from `mode`). A different recipe supplies its own check set, or
none at all.

## Two modes

1. **Named-component audit (hard gate, D8)** — when called with specific
   names (by `figma-sync`, `figma-create`, or the user), any violation on
   those nodes **fails loud**. Targets by the registry's `nodeId` whenever
   the name resolves there (authoritative — never a name-based sweep, which
   used to match every same-named node in the file). A name with no registry
   entry — a SCREEN or foundation frame (e.g. `foundations/sticker-sheet`),
   which `figma-create`'s own flow requires as a hard gate — falls back to a
   name lookup against COMPONENT, COMPONENT_SET, FRAME, and SECTION nodes,
   but only when it resolves to EXACTLY one node; an ambiguous name reports
   `ambiguous-audit-target-name` instead of silently auditing every match.
   This is the mode other skills depend on — never soften it to advisory.
2. **File-wide sweep (advisory), SCOPED to registry + screens (D26,
   2026-07-08)** — when run standalone with no component names, walks every
   registry-listed component (`design/registry.json`'s full entry set — kit
   or custom, no exemption; directive 3 still applies) plus every page
   matching the project's real composed-screen convention, `D<NN> <group>`
   (`isDesignPageName`, file-structure.md — matched directly, unconditionally,
   never gated on config) plus, additively, any page named in
   `design.<app>.sweepPageNames` (defaulting to `['Screens']`, for a project
   that also wants a literal catch-all page included) — and reports
   violations as **advisory** findings (un-synced frames, stray hygiene
   issues) — it informs, it doesn't block anything on its own. This is NOT a
   literal every-page walk: a starter file's kit primitive pages,
   demo/example pages, and icon libraries are almost entirely stock content
   nobody in the project touched, and auditing them was pure noise (hundreds
   of findings on unedited shadcn content). Also reports
   `unsectioned-component` (a component not a child of any category shelf
   frame on `Custom Components`) and `missing-component-description`.
   Registry-reconcile is NOT part of this sweep — it moved to `figma-sync`'s
   staleness step (design-system-reset-overhaul.md Slice 4), since both walk
   the live component list against the registry in the same pass. A project
   that genuinely wants every page walked can still pass `pageId` directly to
   `runTier0Audit` — an explicit opt-in, never this skill's default; there is
   no longer a way to silently fall through to a whole-file walk (council-
   review finding, 2026-07-08 — the earlier gate on `sweepNodeIds.length ||
   sweepPageNames.length` fell through to the legacy whole-file branch
   whenever both scoped inputs resolved empty; the scoped-sweep branch is now
   reached whenever `pageId` is absent, full stop).

**Never metadata-dump a whole page or heavy frame.** The audit resolves and
reads specific node ids (from the registry / scoped sweep list), never a
whole-page `get_metadata`. This is the documented #1 MCP failure mode — a
whole-page `get_metadata` has overflowed a live session at ~102k chars. If you
need to inspect a node while triaging a finding, `get_design_context` the exact
node id (token-optimized); fall back to `get_metadata` only when that is too
large, and always narrow a large subtree before reading — never dump the parent.

## Procedure

1. Load `figma:figma-use`.
2. **Derive the full options object first — Node-side, before any
   `use_figma` call.** Run `argo design prepare-tier0-audit-options` (wraps
   `deriveTier0AuditOptions`) with `{ cwd: <host project root>,
   componentNames: [...] }` (or `[]` for a file-wide sweep). It reads
   `.claude/argo.json`'s `design.<app>` block and `design/registry.json`
   Node-side (the sandbox can't read a committed file itself), resolves each
   requested name to its registry `nodeId` (authoritative targeting — a
   name-based sweep used to match every same-named node in the file, e.g.
   auditing "Card" also swept a container frame literally named "Card"), and
   returns `{ componentNodeIds, componentNames, compositeNames,
   semanticCollectionName, additionalAllowedCollectionNames, recipe,
   viewport, sweepNodeIds, sweepPageNames }` — `componentNodeIds` is the
   resolved authoritative target list for a NAMED audit; `componentNames` on
   the way OUT holds only names that had no registry entry (a fallback
   resolved sandbox-side by an unambiguous single-match name lookup, never a
   blind multi-node sweep); `viewport` is `{ width, height }` from
   `design.<app>.viewport` when configured (undefined otherwise — opt-in,
   gates the `screen-viewport-mismatch` check; not the unrelated
   `design.<app>.vrtEnvironment.viewport` STRING, a different concept and
   owner: the Storybook/Playwright VRT capture viewport). `sweepNodeIds`
   (every registry component's nodeId) and `sweepPageNames` (defaulting to
   `['Screens']`) are populated ONLY when `componentNames` was passed in
   empty (sweep intent) — empty for a named audit. Keep the whole returned
   object — every DATA field the bundled script's completion value needs;
   never hand-author a trimmed `{ componentNames: [...] }`.
3. **Bundle the audit for the returned `recipe` — never hand-assemble or
   paste raw source into `use_figma`.** Run `argo design bundle-tier0-audit
   --recipe <recipe>` (wraps `bundleTier0AuditForRecipe`), `cwd` set to the
   host project root (so `@argohq/kit` resolves from its `node_modules`).
   This generates a tiny entry module that imports `runTier0Audit` from
   `@argohq/kit/design-kit/tier0-audit` plus (for a recipe with tier-0
   checks) that recipe's own check functions, e.g.
   `@argohq/kit/design-kit/shadcn-tailwind/tier0-walker`, wires the DATA
   fields from step 2's options into them (functions can't cross the
   `use_figma` data boundary, so they're baked into the bundle by import —
   only the DATA options object crosses it), and shells out to `bun build
   --bundle --format=esm` — restoring the bare-completion-value ending (a
   naive tree-shake would otherwise discard the whole audit body as
   "unused") and verifying the result has zero `import`/`export` statements
   and is under `use_figma`'s 50,000-char cap. Nothing is written into the
   host project's `design/` dir — the bundle lands at a cached tmp path this
   command prints; read that file and paste ITS content into `use_figma`,
   never a hand-assembled source module.
   - **PREFERRED — prime-once / replay cache (biggest per-run token lever).**
     The bundle is ~28KB of opaque machine code, and `use_figma` has no
     module resolution or cached-script handle — historically the agent
     re-pasted the whole ~28KB into *every* audit call, and the "re-run after
     any fix" rule guarantees ≥2 embeds per run. Instead, embed it **once**
     and replay it from an in-Figma cache (`figma.root` shared plugin data —
     the only cross-call persistence `use_figma` exposes; `eval`/`new Function`
     both run in that sandbox, verified live):
     1. **Prime (once per file session):** run
        `argo design bundle-tier0-audit --recipe <recipe> --emit prime` and
        paste the printed `script` into ONE `use_figma` call. It stores the
        bundle + a kit-version hash on `figma.root` and returns
        `{ primed: true }`. This is the only call that carries the full ~28KB.
     2. **Audit + every re-audit:** run
        `argo design bundle-tier0-audit --recipe <recipe> --emit replay
        --options '<the FULL options JSON from step 2>'` and paste the printed
        `script`. It is **tiny** (<1KB): it reads the primed bundle back,
        reconstructs the audit function via `new Function`, and runs it with
        your options. No 28KB re-embed, ever.
     3. **Cache-miss:** if a replay returns `{ __tier0CacheMiss: true }` (never
        primed this session, or a kit rebuild changed the version hash), re-run
        the prime call, then the replay. The hash is kit-dist-content-aware, so
        a rebuilt kit invalidates the cache automatically — you cannot audit
        with stale rule logic. The cache slot on `figma.root` is keyed per
        session (`CLAUDE_CODE_SESSION_ID`), so N designers fanning out over the
        SAME Figma file each prime/replay their own slot with zero cross-talk —
        re-priming after a miss lands under your own key, so every subsequent
        replay in the session hits.
   - **Fallback (no cache):** if priming isn't possible, `--emit`-less
     `bundle-tier0-audit` still prints the bundle tmp path; read it once, paste
     it once, and on a re-audit reuse that same pasted content — do NOT re-read
     or re-derive it. Re-embedding the bundle every call is pure token waste.
     Never read the bundle to inspect it — it is inert.
   - **Named audit (mode 1):** execute the replay (or bundle) in ONE
     `use_figma` call, calling the completion value with the FULL options
     object from step 2 unchanged.
   - **File-wide sweep (mode 2): ONE `use_figma` call, options unchanged —
     no page fan-out needed.** Step 2's options already carry `sweepNodeIds`
     (every registry component) and `sweepPageNames` (additive, defaulting to
     `['Screens']`); `runTier0Audit` matches every `D<NN> <group>` page
     directly (`isDesignPageName`) regardless of `sweepPageNames`, and
     resolves every `sweepNodeIds` entry via `loadAllPagesAsync` +
     `getNodeByIdAsync`, which finds a node on any
     loaded page WITHOUT switching `figma.currentPage` — so, unlike a
     whole-file walk, the scoped sweep's total audited surface (a project's
     own ~100-200 components/screens, not every top-level frame on a
     starter file's 50+ pages of kit primitives/demos/icon libraries) stays
     small enough for one call regardless of file size. Call the bundle's
     completion value with the FULL options object from step 2 unchanged —
     do not hand-author a `pageId` fan-out; that was the PRE-D26 workaround
     for a whole-file sweep and no longer applies to the default path.
   Execute it via `use_figma`. **Tag every call `figma-read-only` in
   `skillNames`** (fidelity-geometry-verifier.md Slice 13, same mechanism as
   figma-wireframe's `figma-wireframe` tag): the audit itself never mutates
   the file, so these calls must not arm the design-guard write counter —
   omit the tag and every plain audit run (no actual fix) forces a spurious
   audit-owed nudge.
4. Report violations grouped by `severity`. For a named audit with any
   `hard` violation: **fail loud** — list every violation with its
   `nodeId`/`nodeName`/`rule`/`detail`, and do not report success. For an
   advisory sweep: summarize counts by rule, list the worst offenders.
5. **Record the receipt — mandatory for a named audit, the deterministic
   proof design-guard-stop.mjs checks before a session can end.** Immediately
   after `use_figma` returns the violations array, run
   `argo design record-audit-receipt --record
   '{"componentNames":[...],"violations":[...]}'`, passing the EXACT array
   `use_figma` returned (never hand-authored, never summarized) alongside the
   `componentNames` this run audited. This writes `design/audit-receipt.json`
   — `{ timestamp, componentNames, violationCount, writeCounterAtAudit }` —
   which only counts as clean when `violationCount` is 0 and
   `writeCounterAtAudit` matches `.argo/design-guard.json`'s current write
   count (no Figma writes happened after this audit ran). Never report the
   audit as "done" on your own narration — the receipt is the only accepted
   proof; `design-guard-stop.mjs` blocks the session end otherwise.

## Cannot be tested outside Figma

This skill's core logic is a stated, accepted gap in this repo's own test
suite (design-pack plan §6, risk 1) — `tier0-audit.js` only executes inside
Figma's Plugin API sandbox. First real proof is a live run against an actual
Figma file in a host project. Do not invent a synthetic harness for it here.
