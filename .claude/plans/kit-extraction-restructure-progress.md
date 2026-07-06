# Progress — kit-extraction-restructure

Branch: `worktree-kit-extraction` · Plan: `.claude/plans/kit-extraction-restructure.md`

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 — kit skeleton + single-dispatch hooks + fail-closed test | done | 6e7d8b4 | fail-closed acid test red→green; 375 tests green; dispatcher spawns hook scripts as subprocesses (stdin replayed once per hook, short-circuit on first non-zero) |
| 2 — move design-kit, scripts, reporter; delete setup-migrations | done | fff5a18 | | zod-free acid test red→green; 359 tests green; templates' two bare-specifier imports remapped to @argohq/kit subpaths (mapping-table rows); design-config-merge ported to packages/kit/src/config/merge-config-shape.js. Note: pure renames done via `git mv <file> <dir>/` (the bash-source-write guard blocks file-destination mv; content edits all went through Write/Edit) |
| 3 — argo.json + dual-mode hook resolution | done | fa2efab | resolver red→green; 370 tests green; gates rewired to per-app arming; checkpoint review verdict: FAIL with one blocking finding — coverage gate's wired per-app path untested. Remediated: spawn-level suite added to designCoverageGate.test.mjs (7 cases incl. two-apps-one-commit), red proven by temporary gate mutation, 377 tests green. Reviewer's non-blocking notes (pre-existing commit-regex false positives, stale plugin.json description) deferred: regex is out-of-scope ported code; description cleanup folded into Slice 4's skill rewrites |
| amendments (owner rulings 2026-07-06) | done | | (a) tarball→bun-link: plan slices 4-6 rewritten, `link:@argohq/kit` dev protocol, npm publish + `^version` swap at release; (b) co-located unit tests: 36 kit tests moved next to their subjects as `<file>.test.js`, guard-bridge glob widened, kit package `files` excludes tests, templates/rules/testing.md states the rule; exceptions stay in test/ (safety-hook suites, fail-closed e2e, corpus harness, fixtures/helpers) |
| 4 — /argo:init + /argo:update rewrite | pending | | |
| 5 — bun-link local distribution (amended) | pending | | step 19 link preflight first |
| 6 — dual-mode acid-test fixtures | pending | | |
| 7 — walker vacuity + supply-chain hardening | pending | | final review at end |
