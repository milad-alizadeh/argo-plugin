# Design-pack gate wiring (D21)

This project has no CI and no pre-push hooks for design gates (D21): design
verification runs in exactly two places — **(a)** per-slice inside gated
builds, via the host's existing test command (no new git hooks), and **(b)**
on-demand via `/argo:figma-audit` and paired upgrades (`/argo:design-upgrade`).

## (a) Tiers that register as ordinary test projects

Tiers 1, 1b, and 5 are just test files/scripts the host's existing test
command already picks up — a gated build's per-slice `{{TEST_CMD}}` run
covers them automatically, same as any other test in the project.

| Tier | What | Where it lives | Runs via |
|---|---|---|---|
| 1 — spec-diff | story-walking tests vs `design/specs/*.json` | `{{SPEC_DIFF_WALKER_DIR}}` | `{{TEST_CMD}}` |
| 1b — base-congruence | same mechanism over base-component smoke stories | `{{SPEC_DIFF_WALKER_DIR}}` (base-component fixtures) | `{{TEST_CMD}}` |
| 5 — token drift | regenerate `base.css`'s generated region from `tokens.json`, `git diff --exit-code` | `{{TOKEN_DRIFT_SCRIPT}}` | `{{TEST_CMD}}` or a dedicated script step |

No new lefthook/pre-commit entries are needed for these three — they are
ordinary tests, and this project's `{{TYPECHECK_CMD}}`/`{{TEST_CMD}}` already
run at every gated-build slice per the build-plan skill.

## (b) Tier 3 — a separate, serialized script

Tier 3 (visual regression, `{{VRT_WALKER_DIR}}`) is **not** folded into the
per-slice test run: headless Chromium launch contention makes concurrent VRT
runs flaky (documented in the design doc, C16/C8). Wire it as its own
package script, run **serially**:

```json
{
  "scripts": {
    "test:vrt": "vitest run --project vrt --no-file-parallelism"
  }
}
```

Invoke `test:vrt` at:
- a gated build's checkpoint and final verification (alongside the full
  `{{TEST_CMD}}` suite), and
- `/argo:figma-audit` runs, as part of its acceptance sweep.

## Tier 0 and tier 4 (not test-command-driven)

- **Tier 0** (Figma hygiene audit) only runs via `use_figma` inside
  `/argo:figma-audit`, `/argo:figma-sync`, and `/argo:figma-create` — never
  a test command, since it requires live Figma Plugin API access.
- **Tier 4** (static lint) is enforced by this project's existing lint step
  (`{{LINT_CMD}}`) plus the design-pack's lint rule addition — see
  `templates/design/lint/design-lint.md`. No separate wiring needed; it rides
  the lint job that's already a pre-commit gate.
