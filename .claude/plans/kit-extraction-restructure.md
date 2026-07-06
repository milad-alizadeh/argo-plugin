# Extract `@argohq/kit`, thin the plugin to safety guardrails + LLM surface, bun-link-distribute locally

> **AMENDED 2026-07-06 (owner ruling, matches design doc decision 4 as updated):**
> development is single-machine only, so the committed-tarball mechanism
> (`bun pm pack` → `file:vendor/*.tgz`) is **cancelled**. Dev phase: `bun link`
> in `packages/kit`; consumers commit `"@argohq/kit": "link:@argohq/kit"`.
> Release: `npm publish` + swap `link:` → `^version`. Slices 4-6 below have
> been rewritten to match; everything else is unchanged.

Status: ready to build · Source of truth (grilled + council-reviewed):
`/Users/milad/Developer/argo-v2/.claude/plans/argo-npm-package-and-docs-consolidation.md`
(referenced below as **the design doc**) · Scope: the argo-plugin repo only.
argo-v2's own conversion is a later phase, outlined at the bottom, not built here.

---

## Open questions / ambiguities — RESOLVED by owner ruling

Three points were flagged while grounding this plan as not pinned by the design doc.
The owner has since ruled on all three (2026-07-06); the design doc has been amended
to match (decisions 10 & 11). Recorded here for traceability — no longer open, and
every downstream slice/step below already reflects the ruling:

1. **RESOLVED — version field is a single lockstep version, not a range.**
   `plugin.json`'s field is renamed `compatibleKit` → `"designLibrary": "<major.minor>"`
   — ONE major.minor string, not `{ min, max }`. Plugin + kit release together from the
   same repo (lockstep), so there is nothing to range-check. The kit CLI reads
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` at hook fire and asserts installed
   kit major.minor **equals** the declared value exactly; a mismatch in EITHER direction
   (kit behind, or kit ahead of what the plugin declares) fails loud, naming the exact
   fix command (`bun update @argohq/kit` / `claude plugin update argo@argo`). This plan's
   `compatibleKit`/range language has been replaced throughout (Slice 1 step 5, Slice 4
   step 17, Slice 7 step 29, and the mapping table).
2. **RESOLVED — CLI naming accepted as-is.** The `argo design <script-name>` subcommand
   scheme and `write-design-json.mjs` becoming internal library code (not its own
   subcommand) are ACCEPTED without change. No edits needed anywhere in this plan for
   this point.
3. **RESOLVED — no legacy, fully nuclear (zero backward compatibility).** The project is
   unshipped, so there is nothing to preserve compatibility with:
   - `packages/setup-migrations` is **deleted outright** — no port into the kit, no new
     migrations machinery, no `argo migrate` subcommand, no `src/migrations/` directory
     anywhere in `packages/kit`. This reaches back into THIS plan's own Slice 2 (which
     originally ported `setup-migrations` minus one migration) and Slice 4 (which
     originally routed `/argo:update` through `argo migrate --list`/`--apply`) — both are
     rewritten below to delete rather than port/route.
   - No deprecated skill-name aliases anywhere. `skills/setup-claude/SKILL.md` is
     **deleted outright** and its behavior replaced by `skills/init/SKILL.md` — no
     one-release pointer file, no alias.
   - The argo-v2 conversion milestone (outlined at the bottom of this plan) is
     **rip-and-re-init**: delete argo-v2's old argo-managed files, then run a fresh
     `/argo:init` + `/argo:setup-design`. No migration is designed, needed, or run for
     that conversion — this also **resolves the former open question 3** about a
     not-yet-designed vendor-path migration; there is no migration to design because
     there is no migration step at all.

---

## Context — what exists today (grounded)

- **Plugin manifest:** `.claude-plugin/plugin.json` (version `0.18.4`) and
  `.claude-plugin/marketplace.json` (plugin version `0.12.0`, drifted from the
  manifest — pre-existing, not this plan's concern, but confirms the version
  string a kit-version check must key off is `plugin.json`, not the marketplace file).
- **Hooks (`hooks/hooks.json`, 16 lines → 129 lines, 12 hook files):**
  | Event / matcher | File | Category (design doc decision 1) |
  |---|---|---|
  | PreToolUse/Task | `block-designer-spawn.mjs` | safety — stays plugin-side |
  | PreToolUse/Bash | `block-dangerous-git.sh` | safety — stays |
  | PreToolUse/Bash | `check-pipe-to-shell.mjs` | safety — stays |
  | PreToolUse/Bash | `block-bash-source-write.mjs` | safety — stays |
  | PreToolUse/Bash | `red-proof-gate.mjs` | kit gate — moves |
  | PreToolUse/Bash | `trust-gate.mjs` | kit gate — moves |
  | PreToolUse/Bash | `design-commit-gate.mjs` | kit gate — moves |
  | PreToolUse/Bash | `design-coverage-gate.mjs` | kit gate — moves |
  | PreToolUse/Edit\|Write\|MultiEdit | `block-lockfile-edit.mjs` | safety — stays |
  | SessionStart | `session-context.mjs` | safety — stays (decision 1 names it explicitly) |
  | PostToolUse/Edit\|Write | `format-on-write.mjs` | kit gate — moves |
  | PostToolUse/Edit\|Write | `test-smell.mjs` | kit gate — moves |
  | PostToolUse/mcp\_\_plugin_figma_figma\_\_use_figma | `design-guard-record.mjs` | kit gate — moves |
  | Stop | `design-guard-stop.mjs` | kit gate — moves |
  | SubagentStop | `design-guard-stop.mjs` | kit gate — moves |

  `hooks/lib/gate-block.mjs` (`makeBlock`) is shared glue used by the design-guard
  family — moves with them into the kit.
- **Scripts (`scripts/*.mjs`, exactly 13 files, confirmed by directory listing):**
  `record-spec-diff-receipt.mjs`, `assemble-tier0-audit.mjs`, `capture-kit-corpus.mjs`,
  `capture-kit-inventory.mjs`, `write-design-json.mjs`, `record-audit-receipt.mjs`,
  `region-coverage.mjs`, `extract-built-regions.mjs`, `record-coverage-receipt.mjs`,
  `lint-contract-freeze.mjs`, `prepare-tier0-audit-options.mjs`,
  `check-anti-recreation.mjs`, `extract-region-contract.mjs`. Every one (except
  `write-design-json.mjs`, resolved open question 2) follows the same shape: an exported
  pure function + an `if (import.meta.url === \`file://${process.argv[1]}\`)` CLI
  guard block doing argv parsing (confirmed in `record-audit-receipt.mjs:83-104`,
  `capture-kit-corpus.mjs:37-57`) — this shape maps directly onto CLI subcommands
  that import the same pure function.
- **Packages (`packages/*`):** `figma-design-kit` (11 files, `zod ^3.23.8` dep,
  exports `.`, `./recipes/external-kit`, `./tier0-rules`, `./region-contract`,
  `./xml-metadata-adapter` — confirmed `package.json:9-15`); its `tier0-rules.js`
  has **zero imports** (confirmed by reading its head, no `import` statements before
  the first exported function) — already zod-free, satisfying the design doc's
  blocker as-is, just needs to survive the move. `figma-design-kit-shadcn-tailwind`
  (2 files, zero dependencies, confirmed `package.json:23`) — same zod-free
  guarantee already holds. `design-config-merge` (`mergeConfigShape`).
  `setup-migrations` (`index.js`, `migrations.js`, `resolve-vendor-plan.js`,
  `runner.js`, `semver.js`) — **deleted outright, not ported** (owner ruling, resolved
  open question 3: no migrations machinery survives into the kit at all, not even the
  parts that seemed reusable).
- **Reporters:** `reporters/tdd-guard-playwright/` (`PlaywrightReporter.js`,
  `index.js`, `package.json`) — currently referenced from
  `skills/setup-claude/SKILL.md:176-193` as a vendor-into-host-project target;
  moves into `packages/kit/src/reporters/playwright/` and ships as the
  `@argohq/kit/reporters/playwright` subpath export (design doc §Identity), ending
  the vendor-copy dance for this file entirely.
- **Templates (`templates/*`):** these stay in the plugin verbatim — they are
  bucket 1 (LLM-adapted text), never move to the kit. Confirmed inventory:
  `templates/rules/*.md` (6), `templates/design/*` (recipes, walkers, config
  example, tier0-audit.js source, memory-model.md, file-structure.md,
  screen-brief.md), `templates/graphify/*`, `templates/lefthook.yml`,
  `templates/lefthookrc`, `templates/skills/deepen-architecture/SKILL.md`,
  `templates/product/prd.md`, `templates/mcp/argo-status.json`.
- **Skills referencing moved paths** (full grep across `skills/**/*.md`, both
  `${CLAUDE_PLUGIN_ROOT}/scripts|packages` and bare `scripts/`/`packages/` forms —
  the inconsistency between prefixed and bare references across files is itself
  pre-existing and this plan's rewrite normalizes it): `figma-to-code`,
  `figma-create`, `figma-audit` (×3), `setup-design` (×3), `design-upgrade`,
  `update`. Full mapping table below.
- **Tests:** 49 files under `test/*.test.mjs` + `test/helpers/` + `test/fixtures/`,
  run via root `vitest.config.ts` (feeds `tdd-guard-vitest`, `projectRoot` = this
  repo). These move/split alongside their source per Slice 2.
- **Package manager:** bun (`bun.lock` present at root, no `package-lock.json`).
  Root `package.json` (`@argo/plugin-dev`, private) carries only `vitest`,
  `tdd-guard-vitest`, `evalite` today — no workspaces field yet.
- **No existing `.claude/plans/` entry for this work** — three prior plans exist
  (`design-pack.md`, `design-pack-recipes.md`, both in-progress; `done/project-reconcile.md`,
  `done/semantic-seeding.md`, both landed) and are used as this plan's shape/format
  reference (table-driven design-decision sections, `path:line` citations throughout).

---

## Approach

Single path, no architect-panel fork needed: the design doc already settled the
architecture (council-reviewed, 5 seats). This plan sequences its *execution* into
buildable slices. The load-bearing ordering constraint: hooks must never go dark
mid-restructure (a broken hooks.json blocks every future commit in this repo,
including the ones this plan needs to land) — so Slice 1 builds the kit CLI's
`argo-hook` dispatcher and swaps `hooks.json` to call it in the **same slice**, with
the fail-closed test as that slice's own red-proof, before any of the 13 scripts or
the design-kit packages move.

---

## Script/package → CLI subcommand mapping table (council mandate)

Every `${CLAUDE_PLUGIN_ROOT}/scripts/*` and `packages/*` reference found across all
`skills/**/*.md` (both `${CLAUDE_PLUGIN_ROOT}/...` and bare forms), plus every
`scripts/*.mjs` file that exists but had no literal-filename skill reference
(the council's "no skill may reference a moved path without a mapped replacement"
bar covers both: referenced paths need a replacement, and un-referenced scripts
still need a CLI home since the design doc requires ALL 13 as subcommands).

| Old reference | Referencing skill(s) : line(s) | New CLI subcommand / import |
|---|---|---|
| `scripts/record-spec-diff-receipt.mjs` | `figma-to-code/SKILL.md:68` | `argo design record-spec-diff-receipt` |
| `scripts/check-anti-recreation.mjs` | `figma-create/SKILL.md:234` | `argo design check-anti-recreation` |
| `scripts/assemble-tier0-audit.mjs` (`bundleTier0Audit`) | `setup-design/SKILL.md:221`, `figma-audit/SKILL.md:106` | `argo design assemble-tier0-audit` (writes `design/tier0-audit.bundle.js`) |
| `scripts/prepare-tier0-audit-options.mjs` | `figma-audit/SKILL.md:117` | `argo design prepare-tier0-audit-options` |
| `scripts/record-audit-receipt.mjs` | `figma-audit/SKILL.md:132`, `figma-create/SKILL.md:105,241` | `argo design record-audit-receipt --record '<json>'` |
| `scripts/capture-kit-inventory.mjs` (`buildKitInventory`) | `setup-design/SKILL.md:280`, `design-upgrade/SKILL.md:66` | `argo design capture-kit-inventory` |
| `scripts/region-coverage.mjs` | `build-design/SKILL.md:85` | `argo design region-coverage` |
| `scripts/record-coverage-receipt.mjs` (`buildCoverageReceipt`) | `build-design/SKILL.md:104-107` (named, no explicit path) | `argo design record-coverage-receipt` |
| `scripts/extract-region-contract.mjs` | `build-design/SKILL.md:56-61` (described, not path-cited) | `argo design extract-region-contract <tree> <screen> <wireframeNodeId> <figmaFileVersion>` |
| `scripts/extract-built-regions.mjs` | `build-design/SKILL.md:101-103` (described, not path-cited) | `argo design extract-built-regions <tree>` |
| `scripts/lint-contract-freeze.mjs` | not referenced by any SKILL.md today (council-mandated inclusion) | `argo design lint-contract-freeze <previous\|-> <next>` |
| `scripts/capture-kit-corpus.mjs` | not referenced by any SKILL.md (dev/R7-corpus tooling, own header doc only) | `argo design capture-kit-corpus --record '<json>' --out <path>` |
| `scripts/write-design-json.mjs` | not referenced by any SKILL.md; imported by 3 sibling scripts | **no subcommand** — becomes `src/skill-scripts/lib/write-design-json.js`, internal to the kit (resolved open question 2, accepted as-is) |
| `packages/setup-migrations` (`pendingMigrations`) | `update/SKILL.md:27` | **deleted** — no migrations machinery survives (resolved open question 3); `update/SKILL.md` no longer imports or references this package at all |
| `packages/figma-design-kit` (vendor-path warning) | `setup-design/SKILL.md:298,318` | dropped — no more vendoring; `@argohq/kit/design-kit` is a normal dep |
| `packages/figma-design-kit/schemas.js` (`RegistryEntrySchema`) | `figma-create/SKILL.md:292` | `@argohq/kit/design-kit` (barrel export; zod stays fine off the sandbox path) |
| `packages/figma-design-kit/registry-reconcile.js` (`reconcileRegistrySweep`) | `figma-audit/SKILL.md:70` | `@argohq/kit/design-kit` |
| `packages/figma-design-kit/tier0-rules.js` | sandbox bundle assembly (`setup-design/SKILL.md` §4, `templates/design/tier0-audit.js:8`) | `@argohq/kit/design-kit/tier0-rules` (zod-free subpath, unchanged content) |
| `packages/figma-design-kit-shadcn-tailwind/tier0-rules.js` | sandbox bundle assembly (recipe checks) | `@argohq/kit/design-kit/shadcn-tailwind/tier0-rules` (zod-free subpath) |
| `packages/figma-design-kit-shadcn-tailwind` (root) | recipe barrel | `@argohq/kit/design-kit/shadcn-tailwind` |
| `packages/design-config-merge` (`mergeConfigShape`) | `update/SKILL.md` (via setup-design's update mode), `project-reconcile.md` | internal to `argo init`/`argo update`'s config-merge step, not a standalone CLI verb |
| `reporters/tdd-guard-playwright/` | `setup-claude/SKILL.md:176-193` | `@argohq/kit/reporters/playwright` (subpath dep, `@playwright/test` optional peer) |

---

## Files to change (by slice — exact paths only; no placeholders)

**Slice 1 — kit skeleton + hook single-dispatch + fail-closed test**
- `packages/kit/package.json` (new) — `name: "@argohq/kit"`, `bin: { argo: "bin/argo.js" }`,
  `exports` map per Identity decision 3, `peerDependencies: { "@playwright/test": "*" }`,
  `peerDependenciesMeta: { "@playwright/test": { optional: true } }`, `dependencies: { tdd-guard: "..." }`.
- `packages/kit/bin/argo.js` (new) — single entry, subcommand dispatch (`argo-hook <event>`,
  `argo design <verb>`, `argo init`, `argo update`, `argo graph refresh`, `argo doctor`) —
  no `argo migrate` (resolved open question 3: no migrations machinery), lazy `import()`
  per branch (decision 12 — a red-proof fire never loads the design-kit comparator).
- `packages/kit/src/hooks/red-proof-gate.js`, `trust-gate.js`, `design-commit-gate.js`,
  `design-coverage-gate.js`, `format-on-write.js`, `test-smell.js`,
  `design-guard-record.js`, `design-guard-stop.js`, `lib/gate-block.js` — ported verbatim
  from `hooks/*.mjs` + `hooks/lib/gate-block.mjs` (logic unchanged, only module home moves).
- `hooks/hooks.json` — rewritten per the table below (safety hooks keep their raw
  `node "${CLAUDE_PLUGIN_ROOT}/hooks/*.mjs"` lines verbatim; kit gates collapse to one
  wrapper line per event+matcher).
- `hooks/red-proof-gate.mjs`, `trust-gate.mjs`, `design-commit-gate.mjs`,
  `design-coverage-gate.mjs`, `format-on-write.mjs`, `test-smell.mjs`,
  `design-guard-record.mjs`, `design-guard-stop.mjs`, `hooks/lib/gate-block.mjs` — deleted
  (superseded by the kit copies).
- `.claude-plugin/plugin.json` — add `"designLibrary": "0.1"` (single major.minor string,
  lockstep — replaces the earlier `compatibleKit` range field, resolved open question 1).
- `test/fail-closed-hook.test.mjs` (new) — the council-mandated fail-closed acid test.
- `test/redProofGate.test.mjs`, `test/trustGate.test.mjs`, `test/designCommitGate.test.mjs`,
  `test/designCoverageGate.test.mjs`, `test/designGuardRecord.test.mjs`,
  `test/designGuardStop.test.mjs` — import paths updated to `packages/kit/src/hooks/*.js`.

**New `hooks/hooks.json` shape (Slice 1 deliverable, stated concretely — no "similar to above"):**
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Task", "hooks": [
        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/block-designer-spawn.mjs\"", "timeout": 5 }
      ]},
      { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/block-dangerous-git.sh", "timeout": 5 },
        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/check-pipe-to-shell.mjs\"", "timeout": 5 },
        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/block-bash-source-write.mjs\"", "timeout": 5 },
        { "type": "command", "command": "npx --no @argohq/kit argo-hook bash-pretooluse || { echo 'argo gates inactive: run bun install (or /argo:init)' >&2; exit 2; }", "timeout": 10 }
      ]},
      { "matcher": "Edit|Write|MultiEdit", "hooks": [
        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/block-lockfile-edit.mjs\"", "timeout": 5 }
      ]}
    ],
    "SessionStart": [
      { "matcher": "startup|resume|clear|compact", "hooks": [
        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-context.mjs\"", "timeout": 5 }
      ]}
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": "npx --no @argohq/kit argo-hook post-edit-write || { echo 'argo gates inactive: run bun install (or /argo:init)' >&2; exit 2; }", "timeout": 15 }
      ]},
      { "matcher": "mcp__plugin_figma_figma__use_figma", "hooks": [
        { "type": "command", "command": "npx --no @argohq/kit argo-hook design-guard-record || { echo 'argo gates inactive: run bun install (or /argo:init)' >&2; exit 2; }", "timeout": 5 }
      ]}
    ],
    "Stop": [
      { "hooks": [
        { "type": "command", "command": "npx --no @argohq/kit argo-hook design-guard-stop || { echo 'argo gates inactive: run bun install (or /argo:init)' >&2; exit 2; }", "timeout": 5 }
      ]}
    ],
    "SubagentStop": [
      { "hooks": [
        { "type": "command", "command": "npx --no @argohq/kit argo-hook design-guard-stop || { echo 'argo gates inactive: run bun install (or /argo:init)' >&2; exit 2; }", "timeout": 5 }
      ]}
    ]
  }
}
```
`argo-hook bash-pretooluse` internally lazy-dispatches red-proof → trust →
design-commit → design-coverage in that order (matches today's `hooks.json` order,
`hooks/hooks.json:34-52`), short-circuiting on the first non-zero exit so the
existing block-first-reason UX is preserved. `argo-hook post-edit-write` dispatches
format-on-write → test-smell (matches `hooks/hooks.json:82-91` order).

**Slice 2 — move design-kit packages, scripts, reporter into the kit (setup-migrations deleted, not moved)**
- `packages/kit/src/design-kit/*.js` (new) — ported from `packages/figma-design-kit/*`
  verbatim (`index.js`, `comparator.js`, `conversion-table.js`, `schemas.js`,
  `waivers.js`, `component-categories.js`, `registry-reconcile.js`, `tier0-rules.js`,
  `region-contract.js`, `xml-metadata-adapter.js`, `recipes/external-kit.js`).
- `packages/kit/src/recipes/shadcn-tailwind/*.js` (new) — ported from
  `packages/figma-design-kit-shadcn-tailwind/*` (`index.js`, `tier0-rules.js`).
- `packages/kit/src/skill-scripts/*.js` (new) — all 13 scripts ported per the mapping
  table (12 as CLI-reachable modules + `write-design-json.js` as internal lib).
- `packages/kit/src/reporters/playwright/*.js` (new) — ported from
  `reporters/tdd-guard-playwright/*`.
- `packages/kit/package.json` — `exports` finalized: `.`, `/design-kit`,
  `/design-kit/tier0-rules`, `/design-kit/shadcn-tailwind`,
  `/design-kit/shadcn-tailwind/tier0-rules`, `/walkers`, `/reporters/playwright`.
- `test/zodFreeTier0Rules.test.mjs` (new) — the zod-free subpath assertion (see
  Verification below).
- `packages/figma-design-kit/`, `packages/figma-design-kit-shadcn-tailwind/`,
  `packages/setup-migrations/` (deleted wholesale, no port — resolved open question 3),
  `packages/design-config-merge/`, `scripts/`, `reporters/` — deleted once every test
  under `test/*.test.mjs` that imported them is repointed (or, for `setup-migrations`,
  deleted outright) and green against the new `packages/kit/src/*` paths.
- Every test file under `test/*.test.mjs` that imports a moved module — import path
  updated (confirmed list from the `test/**` inventory: `figmaComparator`,
  `figmaConversionTable`, `figmaDesignKitExternalKitRecipe`,
  `figmaDesignKitNoRecipeImports`, `figmaDesignKitIndex`, `figmaWaivers`,
  `componentCategories`, `figmaSchemas`, `registryReconcile`, `figmaTier0Rules`,
  `figmaDesignKitShadcnTailwindTier0Rules`, `writeDesignJson`, `readDesignJson`,
  `recordAuditReceipt`, `recordSpecDiffReceipt`, `recordCoverageReceipt`,
  `regionCoverage`, `regionContract`, `regionContractFlatten`, `prepareTier0AuditOptions`,
  `assembleTier0Audit`, `checkAntiRecreation`, `kitInventory`, `captureKitCorpus`,
  `captureKitInventory`, `xmlMetadataAdapter`, `designConfigMerge`, `tddGuardPlaywright`).
  Four `setup-migrations` test files are **deleted, not repointed** (they test code that
  no longer exists anywhere): `setupMigrationsResolveVendorPlan.test.mjs`,
  `setupMigrationsRunner.test.mjs`, `setupMigrationsSemver.test.mjs`,
  `setupMigrationsVendorPathFix.test.mjs`.

---

## Files to change (continued)

**Slice 3 — `argo.json` consolidation + dual-mode hook resolution**
- `packages/kit/src/config/argo-json.js` (new) — schema + the walk-up/arm/resolve
  logic from decision 8's hook-resolution spec: walk up from cwd to find
  `.claude/argo.json`; arm on presence of the matching `design.<app>` block;
  resolve `join(repoRoot, design.<app>.root, componentsPath)`; match staged files
  repo-root-relative.
- `packages/kit/src/hooks/design-commit-gate.js`, `design-coverage-gate.js` — updated
  to call `argo-json.js`'s resolver instead of today's co-located `design/config.json`
  presence check (the design doc names this exact bug: "today's arming on
  `design/config.json` presence already silently no-ops per-app in monorepos").
- `test/argoJsonHookResolution.test.mjs` (new) — monorepo-shaped fixture (two apps,
  only one with a `design.<app>` block) proving the gate arms for the configured app
  and stays inert for the other; single-repo fixture proving `design: { ".": {...} }`
  arms correctly.

**Slice 4 — `/argo:init` and `/argo:update` rewrites (setup-claude deleted, not aliased)**
- `skills/init/SKILL.md` (new, replaces `setup-claude` entirely — `setup-claude` is
  **deleted outright, not aliased**, per resolved open question 3) — LLM half:
  AskUserQuestion wizard shape ported from `skills/setup-claude/SKILL.md` §0–§9, but
  §9's config write now targets `.claude/argo.json` (not `.claude/argo-config.json`),
  and a new §X delegates to `argo init` (the CLI's deterministic half: writes
  `.claude/settings.json` `enabledPlugins`+`extraKnownMarketplaces` per decision 5,
  detects monorepo-vs-single-repo per §Dual-mode, places the
  `"@argohq/kit": "link:@argohq/kit"` dep line accordingly (2026-07-06
  amendment — no vendor tarball), writes `.claude/argo.json` skeleton).
- `packages/kit/src/cli/init.js` (new) — the deterministic half above.
- `skills/setup-claude/SKILL.md` — **deleted outright** (no deprecated-alias pointer
  file — resolved open question 3: no-legacy, `/argo:init` fully replaces it).
- `skills/update/SKILL.md` — rewritten: §2's `import pendingMigrations from
  ${CLAUDE_PLUGIN_ROOT}/packages/setup-migrations` section is **deleted entirely**
  (no `argo migrate` subcommand exists anywhere — resolved open question 3), replaced
  with a step delegating to the new `argo update` CLI subcommand (re-emits
  generated files; no dep-line bump in the dev phase, `link:` is version-less;
  no migration steps of any kind); §1's
  version-handshake read becomes the bidirectional single-version-lockstep check
  (decision 11) — the skill asserts `.claude-plugin/plugin.json`'s `designLibrary`
  major.minor **equals** the installed `@argohq/kit` version's major.minor exactly
  (not a range-contains check), in both directions, via `argo doctor`.
- `packages/kit/src/cli/update.js` (new) — the deterministic half of `/argo:update`:
  re-emits generated files (walker shims, `argo.json` skeleton defaults) while
  preserving user-edited fields via `mergeConfigShape`; no dep-line bump in the
  dev phase (`link:` is version-less — 2026-07-06 amendment). No migrations
  logic — there is no prior-version data shape to migrate away from (resolved
  open question 3).
- `packages/kit/src/cli/doctor.js` (new) — the bidirectional `designLibrary` ===
  installed-kit-version equality check described above.
- `skills/setup-design/SKILL.md` — every `${CLAUDE_PLUGIN_ROOT}/scripts/*` and
  `packages/figma-design-kit*` reference rewritten per the mapping table; §5's whole
  vendor-plan section (lines 291-337) is deleted and replaced with "the kit dep is
  already resolvable — nothing to vendor" (decision 3/4: `@argohq/kit` is a normal
  npm dependency now).
- `skills/figma-to-code/SKILL.md:68`, `skills/figma-create/SKILL.md:234,292`,
  `skills/figma-audit/SKILL.md:70,106,117,132`, `skills/design-upgrade/SKILL.md:66`,
  `skills/build-design/SKILL.md:85,104-107` — path references rewritten per the table.

**Slice 5 — bun-link-based local distribution (AMENDED — tarball mechanism cancelled)**
- `packages/kit/package.json` — version stays `0.1.0` (lockstep with
  `designLibrary: "0.1"`; the `0.0.0-dev.N` tarball versioning scheme dies with
  the tarball mechanism).
- `package.json` (plugin repo root) — adds `"workspaces": ["packages/*"]` so the
  plugin repo dogfoods its own kit via the workspace (decision 4, last sentence —
  unchanged by the amendment).
- `test/preflight-bun-link-dep.md` (new — a documented, run-once-and-record
  preflight, NOT a vitest test, since it exercises `bun link`/`bun install`
  themselves rather than code under test): register the link (`cd packages/kit &&
  bun link`), then from a scratch consumer with `"@argohq/kit": "link:@argohq/kit"`
  run `bun install` and confirm (a) the dep resolves to a symlink at the linked
  packages/kit, (b) the `argo` bin is exposed through `node_modules/.bin`, (c)
  `npx --no @argohq/kit argo-hook bash-pretooluse` resolves through the link (the
  hooks.json wrapper path works). Record the exact commands + output; flag any
  surprise as a blocking finding.
- Release path (documented, not fired in this plan): `npm publish` from
  `packages/kit` (Slice 7's OIDC workflow) + consumers swap `link:@argohq/kit` →
  `^<version>`. No pack script, no `vendor/` dir, anywhere.

**Slice 6 — dual-mode acid-test fixtures**
- `test/fixtures/acid-monorepo/` (new) — a minimal two-app bun-workspaces fixture
  repo (package.json with `workspaces`, two `apps/*` dirs, one with a
  `design.<app>` block in its own `.claude/argo.json`).
- `test/fixtures/acid-single-repo/` (new) — a minimal single-package fixture repo
  (`design: { ".": {...} }`).
- `test/acidInit.test.mjs`, `test/acidGateFire.test.mjs`, `test/acidUpdate.test.mjs`
  (new) — drive `argo init` → simulate a hook fire → `argo update` against BOTH
  fixtures, asserting the monorepo gate arms only for its configured app and the
  single-repo gate arms for `"."`.

**Slice 7 — walker vacuity assertion + supply-chain hardening (checkpoint → landing)**
- `packages/kit/src/walkers/*.js` (new) — the walker factories, rewritten to the
  glob-map signature (decision 14): factory receives `Record<path, module>` +
  imported JSON, not paths.
- `test/walkerVacuity.test.mjs` (new) — asserts both the `spec-diff` and `vrt` vitest
  projects report nonzero test count once the acid-test fixtures' smoke story
  exists, so a future rename can never silently zero out the gate (decision 14's
  explicit mandate).
- `.github/workflows/publish.yml` (new) — OIDC/Trusted-Publisher `npm publish
  --provenance`, no long-lived `NPM_TOKEN` (decision 13). Not fired in this plan
  (local bun-link phase only) but wired now so publish-readiness isn't a future gap.
- `packages/kit/package.json` — `"publishConfig": { "access": "public" }` added
  (inert until Slice-7+1 publish, per decision 13).

---

## Step-by-step work items

### Slice 1 — kit skeleton + single-dispatch hooks + fail-closed test
1. Create `packages/kit/package.json`, `packages/kit/bin/argo.js` with a bare
   `argo-hook <event>` branch that currently no-ops (returns 0) — this is the RED
   step: wire `hooks/hooks.json`'s kit-gate lines to call it, confirm gates are
   inert (expected, nothing ported yet).
   Verify: `cd packages/kit && bun pm pack --dry-run` succeeds (package.json is valid).
2. Port the 8 kit-gate hook files + `lib/gate-block.mjs` into
   `packages/kit/src/hooks/*.js` verbatim; wire `argo-hook bash-pretooluse` and
   `argo-hook post-edit-write`/`design-guard-record`/`design-guard-stop` to
   lazy-`import()` and call them in the documented order.
   Verify: `bun run test` (root `vitest.config.ts`) green after updating the 6
   affected test files' import paths.
3. Delete the 8 superseded `hooks/*.mjs` files + `hooks/lib/gate-block.mjs`.
   Verify: `grep -r "hooks/red-proof-gate.mjs\|hooks/trust-gate.mjs\|hooks/design-commit-gate.mjs\|hooks/design-coverage-gate.mjs\|hooks/format-on-write.mjs\|hooks/test-smell.mjs\|hooks/design-guard" hooks/hooks.json` returns nothing (only the 5 safety files remain referenced there).
4. Write `test/fail-closed-hook.test.mjs`: in a temp dir with NO `node_modules`,
   run the exact wrapper line (`npx --no @argohq/kit argo-hook bash-pretooluse || { ...; exit 2; }`)
   via `execSync` with `{ shell: true }`, feeding a synthetic PreToolUse Bash
   tool-input JSON on stdin naming a dangerous git command as the payload; assert
   exit code `2` and stderr contains `argo gates inactive`.
   Verify: `bun run test -- fail-closed-hook` passes; then confirm the SAME test
   FAILS (exit 0, silent pass) if the `|| { ...; exit 2; }` fallback is temporarily
   removed from the wrapper string in the test fixture — proving the test actually
   exercises the fail-closed path, not just "npx errors happen to exit non-zero."
5. Add `"designLibrary": "0.1"` to `.claude-plugin/plugin.json` (single major.minor
   string, lockstep — resolved open question 1, replaces the earlier `compatibleKit`
   range field).
   Verify: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"` succeeds.

Build metadata: steps 1-3 `testable: true` (`requiresLaunch: false`); step 4
`testable: true`, `requiresLaunch: false` (it's a subprocess test, not an app
launch); step 5 `testable: false` (config-only). Scoped verify: `bun run test`
from repo root (vitest.config.ts covers this whole repo, no sub-workspace split
yet at this slice).

### Slice 2 — move design-kit, scripts, reporter; delete setup-migrations
6. Port `packages/figma-design-kit/*` → `packages/kit/src/design-kit/*.js` verbatim
   (no logic changes); port `packages/figma-design-kit-shadcn-tailwind/*` →
   `packages/kit/src/recipes/shadcn-tailwind/*.js`.
   Verify: `bun run test` after repointing the 11 affected test files' imports.
7. Port all 12 CLI-bearing scripts (13 minus `write-design-json.mjs`) into
   `packages/kit/src/skill-scripts/*.js`, each keeping its exported pure function
   + argv-parsing block; port `write-design-json.mjs` →
   `packages/kit/src/skill-scripts/lib/write-design-json.js` (function only, no
   CLI block). Wire each as an `argo design <verb>` subcommand in `bin/argo.js`.
   Verify: `bun run test` after repointing the corresponding test files; manually
   invoke `node packages/kit/bin/argo.js design record-audit-receipt --record '{"componentNames":[],"violations":[]}'`
   from a scratch temp cwd and confirm it writes `design/audit-receipt.json` there
   (matches `record-audit-receipt.mjs`'s existing documented usage).
8. Port `reporters/tdd-guard-playwright/*` → `packages/kit/src/reporters/playwright/*.js`;
   add it to `packages/kit/package.json`'s `exports` as `/reporters/playwright`.
   Verify: `test/tddGuardPlaywright.test.mjs` green against the new path.
9. Delete `packages/setup-migrations/` wholesale — **no port** (owner's no-legacy
   ruling, resolved open question 3: no migrations machinery survives into the kit,
   not even `runner.js`/`semver.js`, since there is no `argo migrate` subcommand to
   run them from). Delete `test/setupMigrationsResolveVendorPlan.test.mjs`,
   `test/setupMigrationsRunner.test.mjs`, `test/setupMigrationsSemver.test.mjs`,
   `test/setupMigrationsVendorPathFix.test.mjs` (all four test the deleted package).
   Verify: `bun run test` full green; `grep -r "setup-migrations" test/ packages/kit/src/`
   returns nothing.
10. Finalize `packages/kit/package.json` `exports` map to the full Identity list
    (decision 3); write `test/zodFreeTier0Rules.test.mjs`: `bun build --bundle
    --format=esm` the `/design-kit/tier0-rules` and
    `/design-kit/shadcn-tailwind/tier0-rules` subpaths to a temp file, assert the
    bundled output string does NOT contain `"zod"` (a simple substring check on
    the bundle text is sufficient — module names/imports get inlined or left as
    bare specifiers, either way `zod` would appear literally if pulled in).
    Verify: `bun run test -- zodFreeTier0Rules` passes.
11. Delete `packages/figma-design-kit/`, `packages/figma-design-kit-shadcn-tailwind/`,
    `packages/design-config-merge/` (port its `mergeConfigShape` into
    `packages/kit/src/config/merge-config-shape.js` first, with its test repointed).
    (`packages/setup-migrations/` was already deleted in step 9.)
    Verify: `bun run test` full green; `git status` shows only the planned deletes/adds.

Build metadata: all steps `testable: true`, `requiresLaunch: false`. Scoped
verify: `bun run test` (root).

### Slice 3 — `argo.json` + dual-mode hook resolution
12. Write `packages/kit/src/config/argo-json.js`: `findArgoJson(cwd)` (walk up
    directories to the first `.claude/argo.json`), `resolveDesignArming(argoJson,
    appKey)` (arm iff `design[appKey]` exists), `resolveComponentsPath(repoRoot,
    designBlock)` (`join(repoRoot, designBlock.root, designBlock.componentsPath)`),
    `matchesStagedFile(resolvedPath, stagedRepoRelativePaths)`.
    Verify: unit tests in `test/argoJsonHookResolution.test.mjs` covering: (a)
    monorepo with two apps, `design` keyed to only one — gate arms for that app's
    componentsPath and stays inert for the other's; (b) single-repo `design: {
    ".": { root: "design", componentsPath: "..." } }` — arms correctly; (c) no
    `.claude/argo.json` anywhere up the tree — inert, no throw.
13. Wire `design-commit-gate.js`/`design-coverage-gate.js` to call `argo-json.js`
    instead of their current `design/config.json`-presence check.
    Verify: `bun run test`; manually run `git diff --cached --name-only` against
    the acid-monorepo fixture (built in Slice 6, so this step's manual check can
    be re-run there once that fixture exists — note this dependency, don't block
    on it: a hand-rolled two-line fixture is enough for THIS step's own test).

Build metadata: `testable: true`, `requiresLaunch: false`. **Checkpoint seam
after step 13** — this is the natural review point: hooks are fully kit-backed,
fail-closed, and dual-mode-correct before the lifecycle-skill rewrite (Slice 4)
and distribution mechanics (Slice 5) build on top of a settled hook contract.

### Slice 4 — `/argo:init` + `/argo:update` rewrite
14. Write `packages/kit/src/cli/init.js`: detects `workspaces` in the host's root
    `package.json` (monorepo) vs absent (single-repo); places the kit dep line
    (`"@argohq/kit": "link:@argohq/kit"` — dev-phase link protocol per the
    2026-07-06 amendment; release swaps to `^version`) at the workspace root or
    the single package.json; writes
    `.claude/settings.json`'s `enabledPlugins`+`extraKnownMarketplaces` (decision
    5 — the sole owner, never `settings.local.json`); writes a starter
    `.claude/argo.json` skeleton shaped per mode (`design` keyed per-app for
    monorepo, single `"."` entry for single-repo).
    Verify: `test/cliInit.test.mjs` (new) runs `argo init` against a scratch
    monorepo fixture and a scratch single-repo fixture (can reuse Slice 6's
    fixtures once built, or minimal ad hoc ones now — don't block Slice 4 on
    Slice 6), asserting the correct dep placement + settings.json shape + argo.json
    shape per mode.
15. Write `skills/init/SKILL.md`, porting `setup-claude/SKILL.md`'s wizard (§0-§9)
    with: §1 entry-mode reading `.claude/argo.json` instead of
    `.claude/argo-config.json`; a new step delegating to `argo init` for the
    deterministic half; §9's write target changed to `.claude/argo.json`.
    Verify: manual read-through diff against the mapping table — every
    `${CLAUDE_PLUGIN_ROOT}/scripts|packages` reference in the new file resolves to
    a path that exists post-Slice-2.
16. Delete `skills/setup-claude/SKILL.md` outright (resolved open question 3:
    no-legacy ruling, no deprecated-alias pointer file — `/argo:init` fully
    replaces it; there is nothing left at the old path for a teammate to find or
    for a skill router to accidentally match).
    Verify: `test ! -f skills/setup-claude/SKILL.md`; `grep -rn "setup-claude"
    skills/ hooks/ templates/` returns no references outside this plan's own
    changelog/commit message.
17. Rewrite `skills/update/SKILL.md`: delete §2's migration-import section
    entirely (no `argo migrate` subcommand exists anywhere — resolved open
    question 3); replace with a step delegating to the new `argo update` CLI
    subcommand (`packages/kit/src/cli/update.js`, deterministic half: re-emits
    generated files — walker shims, `argo.json` skeleton defaults — leaving
    user-edited fields untouched via `mergeConfigShape`; no dep-line bump in the
    dev phase, `link:` is version-less; no migration steps of any kind). Add the bidirectional
    single-version-lockstep check (decision 11) via a new `argo doctor` subcommand
    (`packages/kit/src/cli/doctor.js`) that reads `.claude-plugin/plugin.json`'s
    `designLibrary` field and the installed `@argohq/kit` package.json's own
    version, asserts their major.minor are EQUAL (not range-contains), and fails
    loud naming the exact fix command for whichever side is behind (`bun update
    @argohq/kit` if the kit is older; `claude plugin update argo@argo` if the kit
    is newer than what the plugin declares).
    Verify: `test/cliDoctor.test.mjs` (new) — two fixtures (installed kit
    major.minor below the plugin's declared `designLibrary`, and above it), each
    asserting the correct exact-fix message for that direction.
18. Rewrite `skills/setup-design/SKILL.md` per the mapping table (delete §5's
    vendor-plan section entirely, replace with a one-line "kit dep already
    resolvable"); rewrite the 6 other skill files' path references
    (`figma-to-code`, `figma-create`, `figma-audit`, `design-upgrade`,
    `build-design`) per the table.
    Verify: `grep -rn "CLAUDE_PLUGIN_ROOT}/scripts\|CLAUDE_PLUGIN_ROOT}/packages\|scripts/[a-z-]*\.mjs\|packages/figma-design-kit\|packages/setup-migrations\|packages/design-config-merge" skills/` returns zero matches (every old-path reference has been rewritten).

Build metadata: steps 14 `requiresLaunch: false`, `testable: true`; 15-18
`testable: false` (skill-doc text rewrites — no runtime behavior of their own,
verified by grep/read-through, not a red-green test), except step 17's
`cliDoctor.test.mjs` portion which is `testable: true` (it exercises real CLI
behavior, not just doc text). Scoped verify: `bun run test` + the grep command
in step 18.

### Slice 5 — bun-link-based local distribution (AMENDED — tarball mechanism cancelled)
19. Confirm the amended decision-4 preflight for real: register the link
    (`cd packages/kit && bun link`), create a scratch consumer dir with
    `"@argohq/kit": "link:@argohq/kit"` in its `package.json`, run `bun install`,
    and confirm: (a) `node_modules/@argohq/kit` is a symlink to this repo's
    `packages/kit`, (b) the `argo` bin is exposed (`node_modules/.bin/argo`),
    (c) `npx --no @argohq/kit argo-hook bash-pretooluse` resolves through the
    link with a benign stdin (the hooks.json wrapper path works end-to-end).
    Record the exact commands and output in `test/preflight-bun-link-dep.md`.
    Manual/one-time, not a repeatable vitest test — flag any surprise as a
    blocking finding, since Slices 5-6 depend on the mechanism holding.
20. Add `"workspaces": ["packages/*"]` to the plugin repo's root `package.json`;
    `packages/kit/package.json` version stays `0.1.0` (lockstep with
    `designLibrary: "0.1"` — the `0.0.0-dev.N` scheme died with the tarball).
    Verify: `bun install` from repo root resolves `packages/kit` as a workspace.
21. Document the release path in `packages/kit/package.json`-adjacent docs (the
    plan/progress docs suffice): release = `npm publish` from `packages/kit`
    (Slice 7's OIDC workflow, wired-not-fired) + consumers swap
    `link:@argohq/kit` → `^<version>`. No pack script, no `vendor/` dir.
    Verify: `grep -rn "vendor/\|\.tgz\|pack-kit" packages/kit/ hooks/` returns
    nothing.

Build metadata: step 19 `testable: false` (research/preflight, recorded not
asserted); 20-21 `testable: false` (workspace/config + docs only — no
red-green behavior of their own; the link mechanism is asserted by Slice 6's
acid tests). Scoped verify: `bun install && bun run test`.

### Slice 6 — dual-mode acid-test fixtures
22. Build `test/fixtures/acid-monorepo/` (package.json with `workspaces:
    ["apps/*"]`, `apps/a/` with `.claude/argo.json`'s `design` block, `apps/b/`
    without) and `test/fixtures/acid-single-repo/` (flat package.json,
    `.claude/argo.json`'s `design: { "." : {...} }`).
    Verify: `git status` inside each fixture is clean immediately after creation
    (no stray untracked files from a half-finished scaffold).
23. Write `test/acidInit.test.mjs` (AMENDED): copies each fixture to a temp dir,
    runs `argo init` against it, asserts dep placement (the
    `"@argohq/kit": "link:@argohq/kit"` line at the right package.json) +
    `.claude/settings.json` + `.claude/argo.json` shape per mode. Link
    resolution itself is proven hermetically: the test materializes what
    `bun link` produces (a `node_modules/@argohq/kit` symlink to this repo's
    `packages/kit`) and asserts the `argo` bin + `argo-hook` dispatch resolve
    through it — no global bun link registry mutation from inside the suite
    (the real `bun link` registration is Slice 5's recorded preflight).
24. Write `test/acidGateFire.test.mjs`: after `argo init`, stage a file inside
    `apps/a`'s componentsPath (monorepo fixture) and confirm
    `design-coverage-gate` arms; stage the equivalent file in `apps/b` (no
    `design` block) and confirm it stays inert; repeat both assertions against
    the single-repo fixture's one `"."` entry.
25. Write `test/acidUpdate.test.mjs` (AMENDED): run `argo update` against each
    already-initialized fixture, assert the `link:` dep line is untouched (it is
    version-less — nothing to bump in the dev phase), `.claude/argo.json`'s
    user-set fields are untouched, generated files (walker shims) are
    re-emitted, and no other managed file regressed. No migration step is
    exercised here — there isn't one.
    Verify: `bun run test -- acid` runs all three green for BOTH fixtures (the
    council's "neither mode may be the untested one" bar).

Build metadata: all `testable: true`, `requiresLaunch: false`. Scoped verify:
`bun run test -- acid`.

### Slice 7 — walker vacuity + supply-chain hardening (final review before landing)
26. Port the walker factories into `packages/kit/src/walkers/*.js` with the
    glob-map signature (decision 14): factory receives `Record<path, module>` +
    imported JSON (waivers, kit-patches) rather than paths; shims documented as
    staying at `test/vrt/`/`test/spec-diff/` in host projects (unchanged from
    today — this is a host-side path, the plugin repo doesn't have its own
    walker shims to relocate).
27. Add a smoke story + shim pair to `test/fixtures/acid-single-repo/` (the
    minimal shape needed to exercise a real, non-empty walker run) and write
    `test/walkerVacuity.test.mjs`: run both vitest projects (`spec-diff`, `vrt`)
    against that fixture and assert reported test count > 0 for each — the
    council's explicit "a rename can never silently zero out a gate" assertion.
28. Add `.github/workflows/publish.yml` (OIDC Trusted Publisher, `npm publish
    --provenance`, no `NPM_TOKEN`) and `"publishConfig": { "access": "public" }`
    to `packages/kit/package.json` — wired but not fired (local bun-link phase).
29. Full-repo final pass: `bun run test` (all suites), re-run the fail-closed
    test (step 4) and the zod-free test (step 10) as an explicit regression
    check now that everything has moved, re-run `grep` from step 18, confirm
    `.claude-plugin/plugin.json`'s `designLibrary` field still equals
    `packages/kit/package.json`'s actual major.minor version (lockstep, not a
    range-contains check).
    Verify: `bun run test`, the two grep commands, and a manual `claude plugin
    validate` (or equivalent) if available in this Claude Code version.

Build metadata: 26-27 `testable: true`, `requiresLaunch: false`; 28
`testable: false` (CI config, not exercised locally); 29 `testable: true`
(regression re-run), `requiresLaunch: false`. This slice ends with the plan's
final review — an independent reviewer pass (`argo:reviewer`) before landing,
per the canonical loop.

---

## argo-v2 conversion — later-phase milestone outline (not built here)

Once the plugin repo above is landed and the bun-link local distribution
(`bun link` in packages/kit; consumers on `"@argohq/kit": "link:@argohq/kit"`)
works end-to-end.
This is **rip-and-re-init**, not a migration (resolved open question 3 / decision
10's no-legacy ruling — argo-v2 is unshipped, zero backward compatibility needed):

1. Delete argo-v2's old argo-managed files outright: `.claude/argo-config.json`,
   `apps/desktop/design/config.json`, the `packages/figma-design-kit`/
   `packages/figma-design-kit-shadcn-tailwind` workspace dirs (confirmed vendored
   today at `apps/desktop/package.json:44-45`), and any `scripts/*` copies vendored
   from the old plugin shape. No detection step, no "offer to fold" prompt — clean
   slate, nothing preserved.
2. Run `/argo:init` fresh against argo-v2 (bun-workspaces monorepo, `apps/desktop`
   + `apps/docs`) — it has no prior state to detect or migrate; it writes a brand-
   new `.claude/argo.json`, places the `"@argohq/kit": "link:@argohq/kit"` dep at
   the workspace root (monorepo mode), and writes project-scoped `.claude/settings.json`.
3. Run `/argo:setup-design` fresh against `apps/desktop` to regenerate the design
   pack (walker shims, gate wiring, tokens) from scratch — no port of the old
   generated files.
4. Move docs per decision 6 (`.claude/design/` for human-authored design docs) and
   verify every cross-reference (skills, CLAUDE.md, other plans) still resolves.
5. Re-run the full design-pack smoke (setup-design §8-equivalent) against
   argo-v2's real `apps/desktop` Storybook/Vitest setup to confirm the converted
   pipeline still renders and gates correctly.

---

## Risks & assumptions

- **Risk:** collapsing 4 separate PreToolUse/Bash kit-gate hook entries into one
  `argo-hook bash-pretooluse` call changes failure attribution — today each gate
  is a separate hooks.json entry so Claude Code's own hook-failure UI names the
  failing script; after Slice 1 it names `argo-hook`. Mitigated by the gate's own
  stderr message still naming which internal check blocked (unchanged from
  today's `red-proof-gate.mjs`'s own `block()` messages, ported verbatim).
- **Risk:** `npx --no @argohq/kit` resolution overhead is unmeasured (decision 12
  flags this as a genuine open branch, not settled). Step 4's fail-closed test
  incidentally measures wall time; if it's non-trivial, decision 12's fallback
  (resolve `node_modules/.bin/argo` directly in the wrapper) is a same-slice fix,
  not a new slice — flagged, not deferred silently.
- **Owner-resolved (no longer open, recorded for traceability):** the three points
  originally flagged under "Open questions" are now settled by explicit owner
  ruling, matched in the design doc's decisions 10 & 11: (1) `plugin.json` carries
  a single lockstep `designLibrary` major.minor string, not a range; (2) the CLI
  subcommand naming scheme is accepted as-is; (3) zero backward compatibility —
  `setup-migrations` is deleted outright, no deprecated aliases exist anywhere,
  and the argo-v2 conversion is rip-and-re-init with no migration designed or run.
  A reviewer disagreeing with any of these is still a legitimate checkpoint-seam
  veto, but these are no longer this plan's own assumptions to defend — they are
  the owner's decisions.
- **Risk:** Slice 5 step 19's bun-link preflight (AMENDED from the cancelled
  tarball preflight) is unverified by this planning pass — it is the FIRST thing
  the builder should run in Slice 5, before writing any code that depends on the
  mechanism holding, exactly as sequenced above.

## Amendment log

- **2026-07-06 — tarball → bun link** (owner ruling; design doc decision 4
  updated to match): dev distribution is `bun link` + `"link:@argohq/kit"`
  dep lines; release is `npm publish` + `link:` → `^version` swap. Slices 4-6
  rewritten above; no `vendor/`, `.tgz`, or pack script anywhere.
- **2026-07-06 — co-located unit tests** (owner ruling): every unit test lives
  NEXT TO the file it tests (`packages/kit/src/hooks/red-proof-gate.js` →
  `packages/kit/src/hooks/red-proof-gate.test.js`), never in a parallel/flat
  `test/` tree. Applies to all kit tests already written (moved) and all future
  ones (Slice 4's `cliInit`/`cliDoctor` tests land as
  `packages/kit/src/cli/init.test.js` / `doctor.test.js`; Slice 7's walker
  vacuity test stays path-anchored per the exception). Exceptions that stay in
  `test/`: the dual-mode acid fixtures/harnesses (Slice 6), e2e-style suites
  (e.g. `test/fail-closed-hook.test.mjs`), shared fixtures/helpers, and
  anything path-anchored by gates. `templates/rules/testing.md` states the rule
  for consumer projects.

## Verification (repo-wide)

- `bun run test` from repo root after every slice (root `vitest.config.ts` covers
  the whole repo; no sub-workspace test split introduced by this plan).
- `bun run test -- fail-closed-hook` and `bun run test -- zod-free-tier0-rules`
  (moved to `packages/kit/zod-free-tier0-rules.test.js` by the co-location
  amendment) as
  the two council-mandated hard gates, re-run at the end of Slice 7 as a
  regression check.
- `bun run test -- acid` for the dual-mode acid suite (Slice 6+).
- `grep -rn "CLAUDE_PLUGIN_ROOT}/scripts\|CLAUDE_PLUGIN_ROOT}/packages" skills/`
  should return zero matches once Slice 4 completes (everything routes through
  the kit CLI or a `@argohq/kit` import now).
- `grep -rn "setup-migrations\|argo migrate\|setup-claude" skills/ hooks/
  packages/kit/` should return zero matches once Slice 4 completes (no migrations
  machinery, no deprecated-alias references anywhere).
- Manual: `claude plugin validate` (or the equivalent current-CLI check) against
  `.claude-plugin/plugin.json` after Slice 1's schema addition, and again after
  Slice 7 to confirm nothing broke plugin-manifest validity across the whole move.
</content>
