# project-reconcile.md — build progress

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 — setup-migrations pkg: semver + runner | done | e86b62c | red-green, 8 tests |
| 2 — resolveVendorPlan helper + vendor-path migration | done | e86d15c | red-green, 11 tests, workspace-aware |
| 3 — design/config.json shape-merge | done | c3cf7a4 | red-green, 5 tests |
| 4 — config.example.json grows _meta | done | ca24865 | template/docs |
| 5 — setup-design entry/update mode + §5 workspace vendoring + setup-claude §6c | done | f9c987f | prose |
| 6 — templates-reference _meta + reconcile table | done | 65234f1 | docs |
| 7 — SessionStart design nudge | done | 2ed9a83 | red-green, 4 tests |
| 8 — /argo:update umbrella skill | done | b0212db | prose |
| 9 — manifest bump + README | done | 1a26e8f | v0.11.0 → v0.12.0 |
| 10 — live/scratch dry-run (checkpoint/final review) | in progress | | (c/d/e) verified; (a/b) skill dry-run = hand-off |

Branch: worktree-project-reconcile (off main a8d5ac9 = v0.11.0 + plan commit).
Decision §2a: Option B (design/config.json `_meta`) — no user veto raised.

## Checkpoint review (Slices 1-3, pure logic)
argo:reviewer verdict PASS — clean, 216 green. Two non-blocking notes:
devDependencies not exercised in migration test (identical code path, benign);
mergeConfigShape assigns a freshly-added key by reference. Second resolved by
YAGNI + §5a prose instructing the skill to write `merged` via JSON.stringify
without in-place nested mutation (no caller mutates it).

## Slice 10 live verification (partial — done inline)
- **(d) migration, against REAL argo-v2 files** — confirmed:
  - argo-v2 root is a workspace (`workspaces: ["apps/*","packages/*"]`);
    `resolveVendorPlan` → `{ mode: workspace, packageDir: packages, depSpecifier: workspace:* }`.
  - `detect` on argo-v2's (now hand-fixed) `apps/desktop/package.json` → **false**
    (idempotent no-op — already `workspace:*`).
  - `detect` on a synthetic stale absolute-cache dep → **true**;
    `computePatch` on the workspace host → `figma-design-kit: workspace:*`,
    other deps untouched. Exactly the intended before/after.
- **(c) config shape-merge** and **(e) SessionStart nudge** — covered by unit
  tests (designConfigMerge: 5; sessionContext design-nudge: 4 live-hook cases).
- **(a) hand-edit conflict / (b) untouched-file re-derive** — these are
  setup-design update-mode PROSE behaviors, provable only by driving the
  actual skill end-to-end against a scratch project (agent-driven). Same
  disposition every prior design-pack plan's live slice states; offered as a
  hand-off / can be driven against argo-v2 itself (whose design/config.json
  predates `_meta`, so it's a real "adopt + reconcile" fixture).
