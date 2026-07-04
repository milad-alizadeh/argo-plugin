# Design Pack — Phase A (argo-plugin repo)

**Scope:** author the Figma→Code design pack in this repo, per
`figma-to-code-pipeline.md` §6/§7 item 1 (settled, council-audited design doc
in the argo-v2 repo: `/Users/milad/Developer/argo-v2/.claude/plans/figma-to-code-pipeline.md`).
Everything executed *in* argo-v2 (Phases B–E) is out of scope here — this plan
only produces the installable pack and the interface contracts Phase B/C
consume.

**Status:** ready to build. One architectural decision below (§1) is a call
I've made and am flagging, not silently assumed — override it before Slice 0
if you disagree.

---

## 0. Current-state findings (grounded)

- Skills are real always-on plugin skills under `skills/<name>/SKILL.md`
  (frontmatter `name` + `description`, prose body) — eleven exist today:
  `skills/{author-skill,build-plan,engineering-principles,finish-branch,
  grill-me,orchestrate,root-cause,scaffold,session-handoff,setup-claude,
  spike}/SKILL.md`. There is **no per-skill test suite** in this repo for
  skill *content* — only for hooks/reporters (see below). `setup-claude`
  itself lives here and installs *adapted* templates into host projects; it
  is the literal pattern D9 says to copy (`skills/setup-claude/SKILL.md:1-4`,
  `skills/setup-claude/templates-reference.md:1-34`).
- **Templates are inert, project-agnostic files under `templates/`** —
  never a recognized Claude Code component dir (`README.md:75-85`).
  Existing shape: `templates/rules/*.md` (six rule files, `{{…}}` placeholder
  slots, a `paths:` frontmatter glob — `templates/rules/dependencies.md:1-30`,
  `templates/rules/design-system.md:1-67`, `templates/rules/ui-components.md:1-80`,
  `templates/rules/testing.md:1-143`), `templates/lefthook.yml` +
  `templates/lefthookrc` (pre-commit job template with `{{LINT_CMD}}`/`{{TYPECHECK_CMD}}`
  slots — no pre-push suite, by standing decision 2026-07-04: full verification
  lives in gated builds, not git hooks), `templates/graphify/*` (script +
  gitignore template), `templates/mcp/argo-status.json`, and
  `templates/skills/deepen-architecture/SKILL.md` (a *copied-into-host-project*
  skill, the one precedent for that shape — used only when graphify is present).
- **Real, testable logic that must ship WITH the plugin (not templated
  per-project) already has a precedent: `reporters/tdd-guard-playwright/`** —
  a small vendored package (`reporters/tdd-guard-playwright/package.json:1-27`,
  `index.js:1-2`, `PlaywrightReporter.js`), unit-tested from this repo's own
  `test/tddGuardPlaywright.test.mjs:1-186` (imports the reporter directly,
  validates against the real `tdd-guard` zod contract), and installed into
  host projects as **a path dependency until published**
  (`skills/setup-claude/SKILL.md:168-172`). Root `vitest.config.ts:1-13` runs
  every `test/*.test.mjs` with the `tdd-guard-vitest` reporter feeding this
  repo's own gates; `package.json:8-16` has no `include` narrowing beyond
  Vitest defaults, so a new `test/*.test.mjs` file is picked up for free.
- **No `packages/` directory exists yet** (confirmed: `Glob packages/*` →
  no results) — the design pack's pure logic would be the first thing to
  live there.
- **No `.claude/plans/` directory exists in this repo** (confirmed empty) —
  created by this write.
- Hooks are registered in `hooks/hooks.json:1-77` (PreToolUse/PostToolUse/
  SessionStart, `${CLAUDE_PLUGIN_ROOT}`-relative commands) — the design pack
  adds no new *hooks* (no gate needs to intercept a tool call; every tier-0–5
  gate in the design doc runs per-slice inside gated builds — as ordinary test
  projects the host's test command picks up — or as an on-demand skill, per
  D21; no git hooks).
- `.claude-plugin/plugin.json:1-8` (v0.7.10) and `.claude-plugin/marketplace.json:1-15`
  are the manifest/marketplace — no explicit skill enumeration to edit
  (Claude Code auto-discovers `skills/*/SKILL.md`); only the free-text
  `description` field needs updating to mention the pack, and the version
  should bump per the repo's existing semver practice.
- `skills/setup-claude/SKILL.md` §6c shows the exact "detect → default-on
  install with a clear skip path, never silently required" pattern
  (`SKILL.md:155-217`, the tdd-guard section) — the right model for D16's
  shadcn MCP inclusion, and for AskUserQuestion-driven wizard UX (`SKILL.md:16-27`).
- `agents/planner.md` (this agent's own body) confirms the build-metadata
  contract (`testable`/`requiresLaunch`/seam/scoped-verify) that every work
  item below must carry.

---

## 1. Architectural decision (flagging, not silently assuming)

The design doc leaves "how the pack is packaged inside argo-plugin" to this
plan (D9: "argo-plugin repo owns final naming/structure"). One choice is
genuinely load-bearing — it decides where D20's comparator, the D1/D15
schemas, and the waiver-invalidation logic physically live and how they get
tested — so I'm presenting it rather than assuming it.

| | **A — everything as copied templates** | **B — new package, mirrors tdd-guard-playwright exactly** | **C — hybrid (recommended)** |
|---|---|---|---|
| What | Comparator, conversion table, schema validators, waiver logic all ship as `templates/design/*.js` text, filled with `{{…}}` and copied by `setup-design` like `lefthook.yml` | ALL design-pack code (including the tier-0 audit script) becomes a new `packages/figma-design-kit/` vendored package, installed as a path-dep | Pure, host-agnostic logic (comparator, conversion table, schema/waiver validators) → new `packages/figma-design-kit/`, unit-tested in **this repo's own** `test/`, installed as a path-dep (mirrors `reporters/tdd-guard-playwright/` exactly). Host-specific or inherently-textual pieces (the tier-0 audit script — it's JS *executed inside Figma's Plugin API sandbox via `use_figma`*, not an importable module; the VRT walker scaffold; gate-wiring snippets; lint rule text; the testing.md amendment; the project config template) stay under `templates/design/`, copied+parameterized like every other template. |
| Pro | Simplest addition, zero new package-management surface | The pack's most correctness-critical artifact (D20's numeric comparator) gets unit tests in the plugin repo itself, not first proven inside a host project | Same test-coverage win as B, but doesn't force the audit script (which fundamentally *can't* be imported — it's a string handed to `use_figma`) into a package shape it doesn't fit |
| Con | D20's comparator — literally the thing 4 council findings (C4/C9/C18/C20) said needed a written, verified spec — ships with **zero test coverage in this repo**; every host copy can silently drift from the spec | One more moving part (package.json, path-dep) for content that's inherently just text | None significant — this is B's split, drawn correctly |

**Recommendation: C.** It's what B/tdd-guard-playwright's own boundary already
implies (a reporter's *logic* is a package; its *wiring into a project's
config* is docs/instructions, not code) — I'm not inventing a new pattern,
I'm applying the existing one at the seam where it actually falls. The rest
of this plan builds C. **If you want A instead, stop before Slice 0** — it
changes Slices 1–4 into templates and removes the package entirely; nothing
downstream would change.

---

## 2. Target layout (after this plan)

```
packages/figma-design-kit/
  package.json          # mirrors reporters/tdd-guard-playwright/package.json shape
  comparator.js         # D20: color normalization, byte-exact px-int, HUG tolerance
  conversion-table.js   # D20: Figma→CSS per-property table (line-height, letter-spacing %, hug-vs-box)
  schemas.js            # D1/D15/D4: story-map, waiver, kit-patches, kit.lock shape validators
  waivers.js            # D15: waiver re-fail + kitLockVersion invalidation logic
test/
  figmaComparator.test.mjs
  figmaConversionTable.test.mjs
  figmaSchemas.test.mjs
  figmaWaivers.test.mjs
templates/design/
  tier0-audit.js               # canonical Plugin API audit script (X3) — {{…}} slots
  vrt-walker/                  # D6 VRT project scaffold (composeStories + toMatchScreenshot)
  spec-diff-walker/            # tier 1/1b story-walking test scaffold
  gate-wiring.md               # D21: tiers 1/1b/5 as test projects under the host test command; tier 3 a separate serialized script
  testing-rule-amendment.md    # C17 scoped-exception text
  lint/design-lint.md          # tier 4 rule text + example ESLint config snippet
  config.example.json          # per-project design config (D9/C20 known-good triad + Figma keys)
skills/
  setup-design/SKILL.md (+ templates-reference.md)
  figma-audit/SKILL.md
  figma-sync/SKILL.md
  figma-create/SKILL.md
  figma-to-code/SKILL.md
  design-upgrade/SKILL.md
```

---

## 3. Interface contracts Phase B/C (argo-v2) will consume

Fixed now so downstream plans can cite them without re-deriving:

- **Per-project design config** — `design/config.json` in the host project
  (written by `setup-design` from `templates/design/config.example.json`):
  ```json
  {
    "figma": { "kitLibraryFileKey": "{{KIT_FILE_KEY}}", "projectFileKey": "{{PROJECT_FILE_KEY}}" },
    "tokenFilePath": "{{TOKEN_FILE_PATH}}",
    "knownGoodTriad": { "storybook": "{{VERSION}}", "vitestAddon": "{{VERSION}}", "vitest": "{{VERSION}}" },
    "vrtEnvironment": { "browser": "{{PINNED_CHROMIUM_BUILD}}", "viewport": "{{W}}x{{H}}", "dpr": 1 }
  }
  ```
- **Committed artifact paths** (per design doc §4, unchanged, just confirmed
  as the contract): `design/tokens.json`, `design/specs/<Component>.json`,
  `design/screenshots/<Component>/<variant>.<mode>.png`, `design/story-map.json`,
  `design/waivers.json`, `design/kit-patches.json`, `design/kit.lock`.
- **Skill invocation names** (final, per §1's naming — kebab-case, matching
  every existing skill in `skills/*`): `/argo:setup-design`,
  `/argo:figma-audit`, `/argo:figma-sync`, `/argo:figma-create`,
  `/argo:figma-to-code`, `/argo:design-upgrade`.
- **Package import path** for Phase C's spec-diff/VRT walkers:
  `figma-design-kit` (path dep during Phase A/B/C, published later if ever —
  same lifecycle note as `tdd-guard-playwright`).

---

## 4. Work items (dependency order, sized as buildable slices)

Each item lists: files, behavior, build metadata, verify command. All
`requiresLaunch: false` (this is the plugin repo, not the Argo app — the
trust gate is Argo-runtime-specific per `skills/setup-claude/SKILL.md:102-104`).

### Slice 0 — package skeleton (testable: false)
- **Files:** `packages/figma-design-kit/package.json` (mirror
  `reporters/tdd-guard-playwright/package.json:1-27` shape: `name`,
  `version: "0.1.0"`, `type: module`, `main`, `exports`, `files`, add `zod`
  as a real dependency for Slice 3's schema validators).
- **Behavior:** empty exports, package installs cleanly (`bun install` from
  repo root picks it up if referenced from `package.json` workspaces — **note:**
  this repo's root `package.json` has no `workspaces` field today; confirm
  whether to add one or keep `figma-design-kit` a standalone dir referenced
  only via path-dep from HOST projects, never from this repo's own root
  deps. Recommendation: no root workspace wiring needed — `test/*.test.mjs`
  imports it by relative path exactly like `tddGuardPlaywright.test.mjs`
  does, with no install step required in this repo).
- **Verify:** `bun run test` (still green, 0 new tests yet).

### Slice 1 — D20 comparator (testable: true)
- **Files:** `test/figmaComparator.test.mjs` (red first), then
  `packages/figma-design-kit/comparator.js` (green).
- **Behavior:** exports `compareColor(figmaRGBA, cssColor)` — normalizes
  both sides to 8-bit sRGB per channel, ≤1/255 per-channel epsilon,
  documented rounding (design doc D20, `figma-to-code-pipeline.md:64`);
  `comparePxInteger(a, b)` — byte-exact for radius/spacing/border/font-size;
  `compareHugDimension(figmaValue, renderedValue, tolerance)` — stated
  tolerance for HUG widths/heights, exact for fixed dimensions.
- **Edge-case matrix** (per this repo's own `templates/rules/testing.md:90-119`,
  applied to pure functions): identical colors in both spaces pass; a
  1-unit-over-epsilon channel diff fails with a named delta; oklch vs sRGB
  round-trip at token boundaries (0, 255, 128); HUG dimension within
  tolerance passes, over tolerance fails with the delta named; fixed
  dimension requires exact match (zero tolerance).
- **Verify:** `bun run test` (root vitest run, this file only during red/green,
  full `bun run test` before commit).

### Slice 2 — Figma→CSS conversion table (testable: true)
- **Files:** `test/figmaConversionTable.test.mjs`, then
  `packages/figma-design-kit/conversion-table.js`.
- **Behavior:** the D20-required "written per-property Figma→CSS
  conversion/rounding table" (`figma-to-code-pipeline.md:64`, C18's fix) as
  executable functions, not just prose: `convertLineHeight(figmaValue, unit)`
  (percent vs px vs unitless → CSS `line-height`), `convertLetterSpacing(percentValue, fontSize)`
  (% → em/px), `resolveBoxModel(layoutSizing)` (HUG vs FIXED → which
  dimension check applies, feeding Slice 1's `compareHugDimension`).
- **Verify:** `bun run test`.

### Slice 3 — schema validators (testable: true)
- **Files:** `test/figmaSchemas.test.mjs`, then
  `packages/figma-design-kit/schemas.js` (zod schemas).
- **Behavior:** `WaiverSchema` — exactly the D15 shape
  `{component, variant, property, figmaValue, codeValue, kitLockVersion, reason, date}`
  (`figma-to-code-pipeline.md:59,63`); `KitPatchSchema` (component, file,
  description, date — D13/D15 sanctioned local kit edits,
  `figma-to-code-pipeline.md:59,89`); `KitLockSchema` (kit version, import
  date, library file key, freshness metadata: file version/lastModified/sync
  timestamp — D4, `figma-to-code-pipeline.md:48,84`); `StoryMapEntrySchema`
  (component key, node id, story id, import path, prop mapping — D1,
  `figma-to-code-pipeline.md:45,87`).
- **Verify:** `bun run test`.

### Slice 4 — waiver re-fail + invalidation (testable: true)
**Checkpoint review here** — this is the seam: everything after this slice
(templates, skills) *consumes* the package; nothing before it does. Spawn
`argo:reviewer` on the branch diff (Slices 0–4) before continuing.
- **Files:** `test/figmaWaivers.test.mjs`, then
  `packages/figma-design-kit/waivers.js`.
- **Behavior:** `checkWaiver(waiver, observedFigmaValue, observedCodeValue)` —
  returns pass only if observed values still match the waiver's pinned pair
  (D15: "the gate re-fails when observed values depart the pinned pair",
  `figma-to-code-pipeline.md:59`); `invalidateWaivers(waivers, currentKitLockVersion)` —
  drops/flags any waiver whose `kitLockVersion` no longer matches (D15,
  used by `design-upgrade`).
- **Verify:** `bun run test` (full suite, since this is the checkpoint).

### Slice 5 — tier-0 audit script template (testable: false)
- **Files:** `templates/design/tier0-audit.js`.
- **Behavior:** the **canonical** Plugin API script (X3's resolution:
  "figma-audit owns the canonical audit script; sync/create call it",
  `figma-to-code-pipeline-audit.md:126`). Checks, per design doc §5 tier 0
  (`figma-to-code-pipeline.md:98`): unbound fills/strokes/radii/type,
  non-Semantic bindings (distinguished by library source per §8's
  foresight, `figma-to-code-pipeline.md:214-216`), missing Auto Layout,
  detached instances, non-semantic names, D18 variant naming
  (`Size`→`size`, Title-Case→lowercase), missing/incorrect dark copy for
  **components only** (D11, `figma-to-code-pipeline.md:55`), explicit
  line-height (D20), node-scoped story URLs (`?node-id=`, D1/C13), edits to
  the kit copy not present in `kit-patches.json`. `{{…}}` slots for the
  Semantic collection name and kit library file key, filled by
  `setup-design` from `design/config.json`.
- **Cannot be unit-tested in this repo** — it only executes inside Figma's
  Plugin API sandbox via `use_figma`. This is a stated, accepted gap (§6
  below), not an oversight; correctness is proven at argo-v2 Phase B's
  first real run.
- **Verify:** static review only (lint/format via the write-hygiene hooks,
  which apply to every file regardless).

### Slice 6 — gate-wiring template + testing.md amendment (testable: false)
- **Files:** `templates/design/gate-wiring.md`, `templates/design/testing-rule-amendment.md`.
- **Behavior:** wiring instructions/snippets for D21 (`figma-to-code-pipeline.md:65,102-104`)
  — **no git hooks**: tiers 1/1b/5 register as test projects the host's existing
  test command picks up, so gated builds run them per-slice automatically;
  tier 3 (screenshots) is a separate **serialized** package script (documented
  Chromium launch-contention flakiness, C16/C8) invoked at gated builds'
  checkpoint/final verification and by `/figma-audit`. Uses
  `{{TYPECHECK_CMD}}`-style placeholders. `testing-rule-amendment.md`
  carries the exact C17 text to append to the host's
  `.claude/rules/testing.md`: a scoped exception for generated spec-diff
  fixtures (naming/directory convention), with the rationale that these
  fixtures regenerate from the design source of truth so the
  break-on-restyle objection (stated at `templates/rules/testing.md:46-50`
  in THIS repo's own testing template) doesn't apply.
- **Verify:** none (text template).

### Slice 7 — VRT walker project template (testable: false)
- **Files:** `templates/design/vrt-walker/` (a small scaffold: Vitest
  browser-mode project config with pinned environment fields — headless
  Chromium build, viewport, DPR, per D22 `figma-to-code-pipeline.md:66`;
  a walker source file using `composeStories` to enumerate stories and
  assert `toMatchScreenshot` against committed baselines, per D6
  `figma-to-code-pipeline.md:50`).
- **Depends on:** none directly, but references `figma-design-kit`'s
  comparator is NOT needed here (VRT is pixel-diff, not spec-diff — the
  comparator belongs to Slice 8).
- **Verify:** none (scaffold copied verbatim, exercised only once installed
  in a host project — no host project exists in this repo to run it against).

### Slice 8 — spec-diff test walker template (testable: false)
- **Files:** `templates/design/spec-diff-walker/`.
- **Behavior:** tier 1/1b story-walking test scaffold
  (`figma-to-code-pipeline.md:99-100`): `getComputedStyle` +
  `getBoundingClientRect` vs `design/specs/*.json`, using **Slices 1–2's
  comparator + conversion table** (imported from `figma-design-kit`), the
  per-mode differential check replacing "token bindings" (C18's fix), and a
  `document.fonts.ready` precondition (D20 font-determinism requirement).
  For tier 1b: variant×state matrix enumeration + CDP `forcePseudoState`
  hook points (D14/C11) — scaffolded as named TODOs the host project's
  `figma-sync` fills from the actual dumped state matrix, not invented here.
- **Depends on:** Slices 1–2 (imports `figma-design-kit`).
- **Verify:** none (same reasoning as Slice 7).

### Slice 9 — lint rule template (testable: false)
- **Files:** `templates/design/lint/design-lint.md` (rule text + an example
  ESLint config snippet), following the existing
  `templates/rules/design-system.md:1-67` shape (a `paths:` frontmatter
  glob, `{{…}}` slots) since tier 4 (`figma-to-code-pipeline.md:103`) is
  exactly this repo's existing "no raw hex/arbitrary values" pattern
  (`templates/rules/design-system.md:20-21`) plus one new rule: no direct
  Primitive-variable references in components (Semantic-only binding,
  D10/§8's library-source distinction).
- **Verify:** none (text template).

### Slice 10 — per-project config template + setup-design reference doc (testable: false)
- **Files:** `templates/design/config.example.json` (shape from §3 above),
  `skills/setup-design/templates-reference.md` (mirrors
  `skills/setup-claude/templates-reference.md:1-34`'s table format — one row
  per `templates/design/*` file: install-when / substitute-with).
- **Verify:** none (text templates).

### Slice 11 — `figma-audit` skill (testable: false)
- **Files:** `skills/figma-audit/SKILL.md`.
- **Behavior:** owns the canonical tier-0 audit (X3). Loads
  `figma:figma-use` first (its own mandatory-prerequisite rule — confirmed
  present in this session's available-skills list), reads
  `templates/design/tier0-audit.js` (already filled into the host's
  `design/` dir by `setup-design`, or read from the plugin's own template if
  running before install), executes it via `use_figma`, reports **hard**
  for named components (fails loud, D8), **advisory** for a file-wide sweep
  of un-synced frames (`figma-to-code-pipeline.md:98,52`).
- **Depends on:** Slice 5.
- **Verify:** manual dry-run only (no Figma file exists in this repo to
  exercise it against — real verification happens at argo-v2 Phase B).

### Slice 12 — `setup-design` skill (testable: false)
- **Files:** `skills/setup-design/SKILL.md`.
- **Behavior:** installs/adapts the whole pack, mirroring `setup-claude`'s
  wizard shape (AskUserQuestion batches, propose-don't-impose, per-rule
  consent — `skills/setup-claude/SKILL.md:16-27,70-72`):
  1. shadcn init via the shadcn MCP (D16) — **default-on where the MCP can
     be installed**, mirroring the tdd-guard default-on pattern exactly
     (`skills/setup-claude/SKILL.md:162-167`: detect CLI availability →
     install default-on with a stated skip path, never silently required).
  2. Latest Storybook (Vite builder) + Vitest addon, recording the
     resulting versions into `design/config.json`'s `knownGoodTriad` (D9/C20)
     — **not hardcoded** in the skill text, satisfying the "pin nothing to
     stale majors" constraint: the triad is *recorded observed-good*, not a
     version pin shipped in this repo.
  3. Copy `templates/design/vrt-walker/`, `spec-diff-walker/`,
     `gate-wiring.md`, `lint/design-lint.md`, `config.example.json` into
     the host project, filling every `{{…}}` slot (per
     `skills/setup-design/templates-reference.md`, Slice 10).
  4. Add `figma-design-kit` as a path dependency (mirrors
     `skills/setup-claude/SKILL.md:168-172`'s tdd-guard-playwright
     instructions verbatim — "path dep until published").
  5. Append the `testing-rule-amendment.md` text to the host's
     `.claude/rules/testing.md` (with consent — never silently edit a file
     `setup-claude` already installed).
  6. Create `design/` dir + empty `waivers.json` (`[]`), `kit-patches.json`
     (`{}`) placeholders.
- **Depends on:** Slices 5–10 (everything it installs) + Slice 11 (it can
  offer to run `figma-audit` as a smoke check after install).
- **Verify:** manual dry-run against a scratch project only (no host project
  in this repo).

### Slice 13 — `figma-sync` skill (testable: false)
- **Files:** `skills/figma-sync/SKILL.md`.
- **Behavior:** audit (calls `figma-audit`, hard gate per D8) → dump
  tokens + specs (variant×state×mode) + reference screenshots + assets →
  build `story-map.json` → stamp freshness metadata (D4: file
  version/lastModified/sync timestamp into `kit.lock`/`tokens.json`) →
  regenerate the `@theme` generated region in `tokenFilePath` → refresh
  fixtures → commit. Dark screen artifacts via a temporary
  `explicitVariableModes` flip on the light frame, reverted after capture
  (D11, `figma-to-code-pipeline.md:55,117`). Builds on `figma:figma-use`.
- **Depends on:** Slice 11 (calls it), Slice 3 (writes schema-shaped
  artifacts).
- **Verify:** manual dry-run only.

### Slice 14 — `figma-create` skill (testable: false)
- **Files:** `skills/figma-create/SKILL.md`.
- **Behavior:** create component/screen in Figma — base instances +
  Semantic bindings only, Auto Layout, semantic names, D18 variant naming,
  dark copy for components (D11) — then self-audit via `figma-audit`,
  fixing violations before reporting done (D8). Builds on
  `figma:figma-use` / `figma:figma-generate-library`.
- **Depends on:** Slice 11.
- **Verify:** manual dry-run only.

### Slice 15 — `figma-to-code` skill (testable: false)
- **Files:** `skills/figma-to-code/SKILL.md`.
- **Behavior:** reads `story-map.json` (or creates the story first via
  Slice 14's flow), consumes **committed** design context + screenshots per
  variant×mode (never live MCP during hands-off `build-plan` runs, C6),
  generates through the normal `test-first` loop, then runs tiers 1–3
  acceptance with D22 ordering: capture → tier-2 gestalt PASS recorded as a
  structured, receipt-hook-checkable verdict artifact → baseline commit
  (never baseline-then-review).
- **Depends on:** Slice 13 (consumes its artifacts), Slice 8 (spec-diff
  walker), Slice 7 (VRT walker), `test-first` skill (already exists).
- **Verify:** manual dry-run only.

### Slice 16 — `design-upgrade` skill (testable: false)
- **Files:** `skills/design-upgrade/SKILL.md`.
- **Behavior:** the D15 paired upgrade — manual shadcn merge (`shadcn diff`
  advisory only, issue #5427) → kit re-import + Library Swap (name-matched)
  → immediate post-swap tier-0 audit (`figma-audit`) failing on any binding
  still resolving to the retired file key → diff variable names pre-swap →
  re-run the congruence gate (tier 1b, Slice 8's walker) → waiver
  invalidation by `kitLockVersion` (Slice 4's `invalidateWaivers`) → update
  `kit.lock`.
- **Depends on:** Slices 4, 8, 11.
- **Verify:** manual dry-run only.

### Slice 17 — manifest/doc sync (testable: false)
- **Files:** `README.md:43-46` (add the six design-pack skills to "What
  ships active"), `.claude-plugin/plugin.json:4` (description mention),
  `.claude-plugin/marketplace.json:11` (version bump), `.claude-plugin/plugin.json:3`
  (matching version bump — keep the two in sync, both currently `0.7.10`).
- **Verify:** none (docs/manifest only); confirm no other file references
  the old skill count/list (`grep -rn "eleven" README.md` before editing the
  prose that currently says "all eleven").

---

## 5. Test strategy

- **`packages/figma-design-kit`** (Slices 1–4): full red-green unit coverage
  in this repo's own `test/`, run via `bun run test` (root `vitest.config.ts`,
  same reporter-fed gate every other hook test uses). This is the ONE part
  of the pack that gets deterministic, repo-local proof before Phase B ever
  touches a real Figma file — directly answering "how is D20's comparator
  verified" (C4/C9/C18's core ask).
- **`templates/design/*`** (Slices 5–10): **no automated tests in this
  repo**, matching the existing, unchallenged precedent for
  `templates/rules/*.md` and `templates/lefthook.yml` — templates are
  validated only once instantiated in a host project, by that project's own
  tooling. Not a gap unique to this plan; stated so it isn't mistaken for one.
- **Skills** (Slices 11–16): no eval/test harness exists in this repo for
  arbitrary skill *behavior* — the one precedent, `eval/card-routing.eval.ts`,
  is narrowly scoped to the SessionStart routing card's wording and uses a
  live `claude --print` spawn scored by regex; it doesn't generalize to a
  multi-step Figma workflow needing live MCP access. Each design-pack skill
  is verified by **manual dry-run** during authoring, and for real by
  argo-v2 Phase B/C/D actually invoking it against a live Figma file — this
  plan does not fabricate a synthetic test for something the design doc
  itself says can't be verified without live Figma/CI infrastructure (C6,
  D21).
- **Full-suite verify command for every slice:** `bun run test` (root) —
  `package.json:8`. No separate lint/typecheck command exists at root today
  (confirmed: `package.json` has only `test`/`eval` scripts) — if Slices
  0–4 introduce any TS, add a typecheck step then; the current package is
  plain JS/mjs like every other hook/reporter in this repo, so none is
  needed as planned.

---

## 6. Risks / open questions

1. **Tier-0 audit script has zero automated coverage in this repo** (Slice 5)
   — it can only execute inside Figma's Plugin API sandbox via `use_figma`.
   Accepted, stated risk, not fixed here; first real proof is argo-v2 Phase
   B's spike (design doc §7 Phase B, anti-spiral rule already scoped there).
2. **"Known-good triad, not hardcoded" vs "latest-tools policy" tension**
   (C20 vs the task's own constraint) — resolved in Slice 12 by making the
   triad **recorded observed-good** in each host project's `design/config.json`
   at `setup-design` install time, never a version pinned in this repo's
   skill text. If a host project's triad breaks on a later Storybook/Vitest
   release, that's a `design-upgrade`-style gated bump in the HOST project,
   not a plugin-repo change — but this plan does not build that upgrade
   detection; it only records the triad. Flagging so it isn't read as solved
   end-to-end.
3. **No root `workspaces` field today** (Slice 0) — `figma-design-kit` is
   planned as a standalone directory imported by relative path from
   `test/*.test.mjs`, exactly like `tdd-guard-playwright`, needing no
   workspace wiring. If you want it as a real bun workspace member instead
   (e.g. to `bun add` it from a sibling package), say so before Slice 0 —
   it changes the package.json shape.
4. **shadcn MCP install mechanics** (D16, Slice 12) — I'm mirroring the
   tdd-guard default-on detect-and-install pattern
   (`skills/setup-claude/SKILL.md:162-167`), but I have not verified the
   exact `shadcn` MCP registration command against its current docs (CLI
   3.0+ per the design doc) — `setup-design` should confirm the live install
   command at authoring time (anti-spiral: research after first failed
   guess, don't invent flags, matching `skills/scaffold/SKILL.md:14`'s own
   "always confirm the current command against docs" rule).
5. **§1's packaging decision (A/B/C)** — flagged above; this plan builds C.
   Confirm before Slice 0 if you want A.
6. **Version bump size for Slice 17** — I've assumed a minor bump (new
   feature pack, no breaking change to existing skills/hooks) but have not
   inferred a specific number; pick one at Slice 17 time consistent with
   whatever pattern past bumps in this repo followed (not audited here —
   out of scope for a design-pack plan to reverse-engineer semver history).

---

## 7. Summary of build metadata (for `/argo:build-plan`)

| Slice | testable | requiresLaunch | seam |
|---|---|---|---|
| 0 | false | false | |
| 1 | true | false | |
| 2 | true | false | |
| 3 | true | false | |
| 4 | true | false | **checkpoint review here** |
| 5 | false | false | |
| 6 | false | false | |
| 7 | false | false | |
| 8 | false | false | |
| 9 | false | false | |
| 10 | false | false | |
| 11 | false | false | |
| 12 | false | false | |
| 13 | false | false | |
| 14 | false | false | |
| 15 | false | false | |
| 16 | false | false | |
| 17 | false | false | final review before landing |
