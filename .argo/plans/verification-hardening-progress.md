# Verification hardening, progress

One row per slice, updated as work lands.

| Slice | Status | Commit | Notes |
| --- | --- | --- | --- |
| 1. screen-viewport-mismatch (hard) | done | pending | 388/388 whole-package tests pass; build clean |
| 2. text-truncation (hard) | done | pending | 393/393 whole-package tests pass; R7 corpus updated |
| 3. unclipped-overflow (advisory) | done | pending | 399/399 whole-package tests pass; advisory-only, not in R7 corpus per its own header |
| 4. viewport config threading | done | pending | 400/400 whole-package tests pass |
| 5. doc verification + fidelity-verifier naming | done | pending | Confirmed via grep: orchestrate/SKILL.md:100 "Independent screen verification" present, now names `argo:fidelity-verifier` explicitly (line 105); designer.md:31-38 "Mid-task messages vs. injection" unchanged, word-for-word as quoted in the plan. No edits needed beyond Slice 6's naming amendment. |

**Plan B complete.** All 6 slices landed.
| 6. agents/fidelity-verifier.md (council addendum) | done | pending | docs-only new agent, mirrors design-verifier.md's isolation contract; orchestrate/SKILL.md's blind-verification bullet now names argo:fidelity-verifier explicitly |
