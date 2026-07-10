# Progress — docs-system

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 (Starlight site) | done | bc2506e | build+check-links verified |
| A (landing page) | done | 280fbd4 | build+check-links verified, visual grep confirms hero/CTAs/toggle-hidden |
| B (theme sync) | done | cf00c46, 03360f2 | unit tests green (4/4), real `argo docs sync-theme` run confirmed `--color-slate` present / `--sidebar-primary` absent, apps/docs build green with generated CSS |
| 2 (reference gen) | done | 84ffdae | --check passes (21 skills/11 agents/6 playbooks), full build+check-links green. Full toolkit suite: 1013 passed / 5 failed — the 5 failures (acidGateFire, acidInit) are a pre-existing worktree-environment artifact, reproduced identically on a pristine worktree before any docs-system edits; pass on the main checkout. Checkpoint review pending. |
| 3 (prose) | pending | | |
| 4 (style rule + lint) | pending | | |
| 5 (manifest + integrator) | pending | | |
| 5b (docs-refresh skill) | pending | | |
| 6 (init opt-in) | pending | | |
| 7 (slim README) | pending | | |
