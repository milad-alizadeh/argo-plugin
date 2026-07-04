# Design Pack — Mechanism/Recipe Split — Build Progress

Plan: `.claude/plans/design-pack-recipes.md`

Decisions confirmed before build (2026-07-04):
- §2 architect panel: **B** (clean-architecture, two-package pure-function extraction)
- §3 B1/B2/B3: all accepted as the plan's stated defaults; B2 (author `no-arbitrary-values` now) confirmed yes

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 0 | done | 4cf99e6 | recipe dir scaffold + config recipe/recipeConfig fields |
| 1 | done | 55c15b1 | moved base-congruence walker; authored kit-patches/kit.lock examples |
| 1a | done | 5daa716 | sourceVersion rename + KitLockSchema/KitPatchSchema subpath export (F1) |
| 2 | done | (pending commit) | tier0-rules.js extracted into figma-design-kit + new figma-design-kit-shadcn-tailwind package; tier0-audit.js + tier0-recipe-checks.js are now thin walkers (per B) |
| 2a | done | (pending commit) | import-boundary guard test; regex scoped to real import/require, not doc-comment prose (avoided a false positive against tier0-rules.js's own docstring) |
| 3 | done | (pending commit) | design-lint.md moved to recipe code-target; authored no-arbitrary-values rule (B1/B2) |
| 4 | pending | | |
| 5 | pending | | |
| 6 | pending | | |
| 7 | pending | | checkpoint review here |
| 8 | pending | | |
| 9 | pending | | |
| 10 | pending | | |
| 11 | pending | | |
| 12 | pending | | |
| 13 | pending | | |
| 14 | pending | | final review before landing |
