# Progress — docs-system

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 (Starlight site) | done | bc2506e | build+check-links verified |
| A (landing page) | done | 280fbd4 | build+check-links verified, visual grep confirms hero/CTAs/toggle-hidden |
| B (theme sync) | done | cf00c46, 03360f2 | unit tests green (4/4), real `argo docs sync-theme` run confirmed `--color-slate` present / `--sidebar-primary` absent, apps/docs build green with generated CSS |
| 2 (reference gen) | done | 84ffdae | --check passes (21 skills/11 agents/6 playbooks), full build+check-links green. Full toolkit suite: 1013 passed / 5 failed — the 5 failures (acidGateFire, acidInit) are a pre-existing worktree-environment artifact, reproduced identically on a pristine worktree before any docs-system edits; pass on the main checkout. Checkpoint review: PASS (non-blocking finding fixed: apps/docs now declares @argohq/toolkit as an explicit devDependency instead of relying on the root workspace's incidental prepare-build ordering). |
| 3 (prose) | done | (this commit) | 9 pages written sourced from README/PIPELINE, build+check-links green (63 links), .argo/docs-manifest.json seeded with initial content hashes |
| 4 (style rule + lint) | done | (this commit) | templates/rules/documentation-style.md + lint-docs-style.mjs, red-first test green; rewrote all Slice 3 prose + landing copy to drop em dashes (the rule's own forbidden phrase); reference/ (generated, sourced from skill/agent frontmatter) excluded from the lint scope — out of bounds for this plan |
| 5 (manifest + integrator) | done | (this commit) | docs-manifest.mjs (hashOf/readManifest/writeManifest/isAiOwned/recordGenerated/markHumanOwned/listEditedPages), 6/6 tests green; agents/integrator.md STEP 1 updated with the auto-update/skip-silently split |
| 5b (docs-refresh skill) | done | (this commit) | skills/docs-refresh/SKILL.md written; page-selection fixture test added to docs-manifest.test.mjs (7/7 green); cross-referenced from integrator.md (Slice 5) and documentation-style.md |
| 6 (init opt-in) | pending | | |
| 7 (slim README) | pending | | |
