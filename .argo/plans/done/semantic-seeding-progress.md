# semantic-seeding.md — build progress

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 — D24 rule: pure predicate + unit tests | done | 18d1f5d | red-green, 33 tests |
| 2 — wire D24 into tier0-audit.js | done | 0cb11df | marshaling-only, unproven outside Figma sandbox until Slice 8 |
| 3 — derive-semantic-seed.js | done (rewritten, see below) | 40c1879, rewritten | now consumes injected `derive` config, returns dump in-session (never writes a file) |
| 4 — semantic-seed.json | done (rewritten, see below) | 0bb14d8, rewritten | now project-owned-only + `derive` config; no kit-derived keys ever committed |
| 5 — seed-semantic.js | done (rewritten, see below) | 43d4a5d, rewritten | now receives derive output via injected `{{DERIVED_SEED_JSON}}` hand-off |
| 6 — wire seeding into setup-design | done (rewritten, see below) | 099ca1b, rewritten | §4a is now a two-call derive→seed pipeline |
| 7 — manifest/version bump | done | dc4933e | 0.9.0 → 0.10.0 |
| 8 — live-file verification (checkpoint/final review) | done | | full pipeline proven live: derive shape, idempotency, create path, D24 audit — nothing kit-derived committed |

## Plan amendments applied mid-build

**Amendment v1** (fix-forward, superseded by v2 below): Primitives spacing
scale + D24 starter tokens made seed-data-driven instead of hardcoded in
seed-semantic.js. This part of v1 survives into the current shape.

**Amendment v2** (2026-07-04, supersedes v1's "derive-once-ship-static-
default" design entirely): nothing kit-derived is ever committed. Figma
variable keys are per-copy (every team's kit duplicate mints new keys, and
`design-upgrade`'s re-import mints a new copy again) — a committed key
snapshot breaks on the first upgrade. Reconciled:

- `semantic-seed.json` (Slice 4) is now COMPLETE from day one: only
  project-owned, name-keyed data (`primitives.spacing`, `semanticSpacing`,
  and a new `derive` config section — `excludeNames` + `roleScopes` as
  data, not hardcoded in the script). No kit variable keys, no placeholder/
  real-content two-phase.
- `derive-semantic-seed.js` (Slice 3) now consumes an injected
  `{{DERIVE_CONFIG_JSON}}` (the seed's `derive` section) and RETURNS its
  `{ colors, floats }` dump in-session — it never writes a file. Installed
  into host projects (baseSource == external-library), not a plugin-repo-
  only maintenance script — `setup-design` §4a runs it against the kit file
  on EVERY seeding, and `design-upgrade` can rerun it after a Library Swap.
- `seed-semantic.js` (Slice 5) now receives the derive step's output via an
  injected `{{DERIVED_SEED_JSON}}` (the in-session hand-off), reading only
  the seed's project-owned `primitives`/`semanticSpacing` sections from the
  co-installed file.
- `setup-design` §4a (Slice 6) is now a two-call pipeline: derive (kit
  fileKey, inject `derive` config) → seed (project fileKey, inject derive
  output). `templates-reference.md`'s three rows updated — derive-semantic-
  seed.js is now installed same as the seeder, not reference-only.
- Slice 8 validates the dynamic pipeline end-to-end and commits nothing
  kit-derived from the live run.

## Slice 8 live verification progress (fileKey 4lPUPl8OUan4i90Bc2ZMXe = kit,
## CLEHEoqvJlRti3dCCfOytS = argo-v2 project file)

1. **Derive step run live against the kit file** — confirmed:
   - Two-mode collection is literally named `mode` (not a generic "any
     two-mode collection" — the kit ALSO has `rdx/colors`, a 396-var
     two-mode Radix palette, which would have made the original
     "exactly one two-mode collection" assumption ambiguous). Fixed in both
     amendment rounds.
   - Mode names are `light mode`/`dark mode` (lowercase), mapped to
     canonical `Light`/`Dark` via fuzzy substring match.
   - All 4 demo artifacts present and excluded exactly as documented.
   - Role-scope table matches every one of the 31 real color names + 12
     float names — no fallthrough to the "no role-scope mapping" throw.
   - Confirmed return shape: 31 COLOR entries (per-mode keys) + 12 FLOAT
     entries (single key) = 43 total (47 minus 4 exclusions) — matches the
     plan's stated expectation exactly.
2. **Idempotency proof against argo-v2** (already-seeded: Primitives 19 vars/
   1 mode named "Value", Semantic 45 vars) — CONFIRMED, re-run against the
   rewritten (amendment v2) seed-semantic.js with the derive step's live
   output injected as `{{DERIVED_SEED_JSON}}`: `0 created / 19 skipped`
   (Primitives), `0 created / 31 skipped` (Semantic colors), `0 created / 12
   skipped` (Semantic floats), `0 created / 2 skipped` (D24 starter tokens).
   Collections themselves also correctly reported `not created` (already
   present). Exact "0 created, N skipped" behavior the task requires.
3. **CREATE path proof** — CONFIRMED, on a fresh scratch file
   (`QqnFxNrLWrkbOhyZ2iWph5`, "semantic-seeding-scratch-test", created in
   Milad Alizadeh's team drafts — **not deleted**, since the Figma MCP has no
   file-delete tool; flagging for the user to remove manually if desired).
   Ran the same seed pipeline against this brand-new, unseeded file: both
   collections created, Dark mode created, 19 Primitives vars created (0
   skipped), 31 Semantic colors + 12 floats + 2 D24 starters all created (0
   skipped) — the CREATE path is fully proven, not just the skip path (the
   original spike only ever proved creation once, on argo-v2, which is now
   already-seeded).
4. **D24 audit exercise** — CONFIRMED, run against the scratch file (not
   argo-v2 — avoided mutating the real project's content; the audit LOGIC
   under test is identical regardless of which file hosts the test frames).
   Created a temporary frame with `itemSpacing` bound to the freshly-seeded
   `Semantic.spacing/page-inline` variable → `gapPaddingSpacingViolations`
   returned `[]` (correctly-bound layout passes). Created a second temporary
   frame with unbound `itemSpacing: 7` (not a member of the 19-step
   Primitives scale) → returned exactly one violation:
   `{ rule: 'gap-padding-off-scale', detail: 'itemSpacing value 7 is not on
   the Primitives spacing scale and is not bound to a Semantic spacing
   variable (D24)' }`. Both temporary test frames were removed after the
   assertion (node IDs `2:2`, `2:3` on the scratch file).

**Slice 8 verdict: pipeline proven end-to-end.** All four checks pass;
nothing kit-derived was committed at any point (per amendment v2). The
`derive-semantic-seed.js`/`seed-semantic.js` templates as they exist on disk
in this branch are the EXACT code exercised above (mode-collection lookup,
canonical Light/Dark mapping, role-scope config consumption, idempotency,
D24 marshaling) — verified via the assembled-template dry-run in
`/tmp/derive-assembled.js` before the live calls, not just conceptually
similar code.
