# project-reconcile.md — build progress

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 — setup-migrations pkg: semver + runner | done | e86b62c | red-green, 8 tests |
| 2 — resolveVendorPlan helper + vendor-path migration | done | e86d15c | red-green, 11 tests, workspace-aware |
| 3 — design/config.json shape-merge | done | c3cf7a4 | red-green, 5 tests |
| 4 — config.example.json grows _meta | pending | | template/docs |
| 5 — setup-design entry/update mode + §5 workspace vendoring + setup-claude §6c | pending | | prose |
| 6 — templates-reference _meta + reconcile table | pending | | docs |
| 7 — SessionStart design nudge | pending | | red-green |
| 8 — /argo:update umbrella skill | pending | | prose |
| 9 — manifest bump + README | pending | | |
| 10 — scratch/live dry-run (argo-v2 fixture) | pending | | checkpoint/final review; manual, likely hand to user |

Branch: worktree-project-reconcile (off main a8d5ac9 = v0.11.0 + plan commit).
Decision §2a: proceeding with Option B (design/config.json `_meta`) per plan recommendation — flagged for user veto, none raised.
