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
| 4 | done | (pending commit) | extracted token-writer.md from figma-sync step 7 |
| 5 | done | (pending commit) | tier-1b conditional note; also fixed the stale lint-file path reference (moved in Slice 3) |
| 6 | done | (pending commit) | templates-reference.md updated for recipe paths/install-when; also authored the recipe's README.md manifest (disposition-table item with no assigned slice in the plan) |
| 7 | done | 91a7c83 | setup-design/SKILL.md: §0a Figma gate, §0b Professional-plan gate (F10), §0c recipe selection; §4/§5/§7 made recipe-conditional |
| 7-fix | done | (pending commit) | Checkpoint review (Slices 0-7) verdict: FAIL — kit-patches-conformance was implemented+tested but never wired into tier0-audit.js (dead code), and figma-audit/SKILL.md:24's doc/code mismatch was still unresolved. Fixed: tier0-audit.js now calls runKitPatchesConformance once per audit (file-wide, via a documented TODO-marked collectModifiedKitCopyNodes() stub — Figma-sandbox-only detection, proven at Slice 14 per existing precedent). Also realigned the splice mechanism to the plan amendment pulled in from main (cherry-picked 49af9a7): single `// {{RECIPE_TIER0_CHECKS}}` marker line, verbatim-content splice by setup-design §4, not an import. Non-blocking finding also fixed: nonSemanticBindingViolation's message restored SEMANTIC_COLLECTION_NAME context (was hardcoded "non-Semantic" after extraction). |
| 8 | done | (pending commit) | figma-audit/SKILL.md: assembled-script contract, mechanism-vs-recipe check split, ad-hoc pre-install assembly procedure |
| 9 | done | (pending commit) | figma-sync/SKILL.md: step 7 delegates to recipe token-writer.md; steps 2-4 gain baseSource-conditional notes |
| 10 | done | (pending commit) | figma-create/SKILL.md branches on baseSource for base-instance composition (B3) |
| 11 | done | (pending commit) | figma-to-code/SKILL.md step 3: tier-1b conditional applicability + updated spec-diff-walker path |
| 12 | pending | | |
| 13 | pending | | |
| 14 | pending | | final review before landing |
