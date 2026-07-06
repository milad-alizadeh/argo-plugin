# Progress — kit-extraction-restructure

Branch: `worktree-kit-extraction` · Plan: `.claude/plans/kit-extraction-restructure.md`

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 — kit skeleton + single-dispatch hooks + fail-closed test | done | 6e7d8b4 | fail-closed acid test red→green; 375 tests green; dispatcher spawns hook scripts as subprocesses (stdin replayed once per hook, short-circuit on first non-zero) |
| 2 — move design-kit, scripts, reporter; delete setup-migrations | done | fff5a18 | | zod-free acid test red→green; 359 tests green; templates' two bare-specifier imports remapped to @argohq/kit subpaths (mapping-table rows); design-config-merge ported to packages/kit/src/config/merge-config-shape.js. Note: pure renames done via `git mv <file> <dir>/` (the bash-source-write guard blocks file-destination mv; content edits all went through Write/Edit) |
| 3 — argo.json + dual-mode hook resolution | pending | | checkpoint review after step 13 |
| 4 — /argo:init + /argo:update rewrite | pending | | |
| 5 — tarball-based local distribution | pending | | step 19 preflight first |
| 6 — dual-mode acid-test fixtures | pending | | |
| 7 — walker vacuity + supply-chain hardening | pending | | final review at end |
