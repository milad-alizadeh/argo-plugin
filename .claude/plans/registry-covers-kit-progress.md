# Registry covers kit, progress

One row per slice, updated as work lands.

| Slice | Status | Commit | Notes |
| --- | --- | --- | --- |
| 1. isKitPageName classifier | done | pending | 8/8 tests pass |
| 2. extractVariantMatrix + buildKitRegistryEntries + Pascal lock | done | pending | 13/13 tests pass |
| 3. pull-registry CLI | done (fixture-verified) | pending | Fixture is hand-assembled from Figma's published REST API shape, clearly marked in `_fixtureNote` — no FIGMA_TOKEN/real starter file was available in this environment. marshalRestDocument/buildPullRegistryResult/token all unit-tested against it, no network. Live-fetch step itself is UNVERIFIED against a real response; re-run against the real starter file before trusting shape assumptions in production. |
| 4. figma-sync SKILL.md wiring | done | pending | docs-only; whole-package sweep green (381/381) |

**Plan A complete.** Slice 3's live-fetch step is verified-by-fixture only (no FIGMA_TOKEN in this environment) — re-run `argo design pull-registry` against the real starter file once a token is available, to confirm `marshalRestDocument`'s REST-shape assumptions hold.
