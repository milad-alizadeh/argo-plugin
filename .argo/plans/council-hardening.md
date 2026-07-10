# Council hardening plan

Source: full-spectrum plugin council (70 agents, 10 dimensions, adversarial
verify), 2026-07-10. Queued AFTER the hooks-to-npx wave lands (it rewrites
`classifier.ts` + `hook.ts` + README dispatch, which half these findings touch).

Dispatch as parallel waves on disjoint file sets. Each fix is test-first;
every security fix needs a regression test that fails before the fix.

## Release-gating (0.57.0 blockers — a gate that silently doesn't gate)

1. **Bash bypasses the protected-path floor** (HIGH, adversarially confirmed).
   `extractPath()` only reads file_path/path/notebook_path; a Bash `{command}`
   yields no path so the protected-path check never fires, and non-argo bash
   writes classify UNCLASSIFIED → allowed. `echo > .argo/state/instances/<key>.json`
   forges the active pointer; `> design/registry.json` / audit-receipt writes
   sail through. Fix: parse Bash redirection/mutation targets (`>`,`>>`,tee,cp,
   mv,sed -i,rm) against isProtectedPath before UNCLASSIFIED is allowed.
2. **Session-affinity collapses to project-wide when `session_id` is falsy** —
   re-opens the 2026-07-10 deadlock-class bug. Fix: a falsy caller session must
   NOT match a pointer that recorded an owner; treat missing session_id as
   "no match" (fail to inert gate, not to project-wide).

## Wave A — classifier/hook security cluster (classifier.ts, hook.ts)

- Bash bypasses a figma-read-only stage via UNCLASSIFIED-allow (arbitrary
  writes/exfil in a read-only stage) — same root as #1.
- Non-figma MCP tool families fall through to UNCLASSIFIED-allow.
- Figma script-sniff evaded by eval/atob, aliased/indirect API calls,
  non-dot-assignment mutation shapes. Consider: for a figma-write-forbidding
  stage, treat un-sniffable `use_figma` scripts as write (fail-closed), not read.
- Protected patterns are bare basenames (`registry.json`, `manifests/**`) with
  no host override and no fail-open — anchor to `.argo/`/`design/` prefixes OR
  add a config exemption list; give it the advisory fail-open the deadlock fix
  established.

## Wave B — state/concurrency (state.ts, playbook-advance.ts, playbook-adopt.ts)

- playbookAdvance stage/status transitions are unprotected read-modify-write
  (recordAttempt/recordHistory already guard; advance doesn't).
- playbook-adopt never sets the active pointer → breaks crash recovery,
  contradicts state.ts's own doc.
- `--artifacts` flag lets a caller substitute doctored artifact paths for the
  produces-derived ones with no validation.
- Active-instance pointer is single-slot per worktree → second session in the
  same worktree steals the gated instance.

## Wave C — trust chain (gates/, skill-scripts/audit, session-guard) — DONE

- ~~Audit nonce proves the bundler ran, not that use_figma executed the audit —
  receipt still self-reported (documented residual; note or narrow).~~ Tightened
  as far as cheaply possible: `record-audit-receipt` now requires `violations`
  to be a real array (an omitted field could silently forge a clean receipt)
  and binds the receipt to a sha256 digest of the actual violations content.
  Full closure (proving use_figma itself produced those violations, not just
  that a bundle was generated for the right component names) still needs the
  cockpit to run the audit in a session the working agent doesn't control —
  documented as a residual in `record-audit-receipt.ts` and
  `session-guard/lib/audit-nonce.ts`, out of scope here.
- ~~record-audit-receipt nonce binds component names, not the violations
  payload.~~ Fixed: `violationsDigest` (sha256 of the violations array) is now
  part of the persisted receipt, and the CLI refuses a `--record` call whose
  JSON omits `violations`.
- ~~design-commit-gate receipt has no binding to the staged diff (stale-but-timely
  receipt reused after further edits).~~ Fixed: both `record-spec-diff-receipt`
  and `design-commit-gate` compute a `workingTreeDriftDigest` (git diff from
  HEAD, scoped to the app root, excluding `design/**` so the gates' own
  receipt/contract files don't self-invalidate) and the gate refuses a receipt
  whose digest no longer matches the currently staged state.
- ~~spec-diff receipt accepts any command's exit code (walker never verified to
  run).~~ Fixed: `record-spec-diff-receipt` now requires the invoked command's
  captured output to carry the walker's own `spec-diff: <storyFile>`
  describe-block signature (`walkers/spec-diff.ts`) before minting a receipt.

## Wave D — docs/DX/packaging (cheap, parallel-safe)

- README dispatch mechanism is the retired `npx --no` form (SUPERSEDED by the
  hooks-to-npx wave — verify it's correct there, don't double-fix).
- build-plan/SKILL.md: gate filenames wrong extension (.mjs vs .js); "PreToolUse
  on git commit" wrong (fires on every Bash call).
- publish.yml is dead code (packages/kit, @argohq/kit, plugin.json.designLibrary
  all gone).
- `--help` on any subcommand executes the real (side-effecting) command; unknown
  flags silently swallowed; bare `argo`/`argo design`/etc give no usage banner.
- Judge spawn error/failure paths: zero test coverage; impl ignores exit status.

## Wave E — comment discipline (restrictive, shipped to all argo projects)

Rule + deterministic checks + full cleanup (NO grandfathering — sweep both
repos). Language-agnostic; installed by /argo:init into every host.

New `templates/rules/comments.md` (always-on, language-neutral):
- Default: NO comment. Code + good names are the documentation.
- Only sanctioned comment: a WHY the code cannot express (constraint,
  invariant, workaround+reason, deliberate-looking-wrong choice). If inferable
  from the code, delete it.
- Forbidden: WHAT-restatement; referential comments in CODE (naming a
  file/path/sibling/"see X"); tombstone/changelog comments; multi-paragraph
  rationale (→ commit message).
- Referential naming allowed only in the interface surface (docs, SKILL.md,
  rules, public API doc) where naming a verb/path IS the contract — there it
  is subject to comment-refs-check.

New toolkit verbs (deterministic, host-runnable, wired into host lint by init,
waivable via the per-project ignorelist):
- `comment-refs-check` — extract referential tokens from docs/SKILL.md/rules
  (paths, filenames, extensions, `argo <verb>`, gate names, stage names,
  config keys) and assert each RESOLVES. Advisory-first in hosts, promote to
  gating once low-false-positive. Targets the interface surface, not code.
- `comment-lint` (or fold into the above) — in CODE, a HIT is the defect:
  flag path/filename/`see <symbol>` referential tokens inside code comments,
  and comment blocks over ~2 lines (multi-paragraph rationale smell). Plus an
  advisory comment-to-code ratio ceiling per file.

Cleanup sweep (both repos, full — argo-plugin toolkit is comment-dense):
- Delete WHAT-comments, tombstones, referential-in-code, narrative rationale.
- Keep only WHY that encodes a non-recoverable constraint.
- Move surviving rationale that's really changelog into git history.
- Run per-package so diffs stay reviewable; do NOT weaken any load-bearing
  fail-closed/invariant comment (the permissions/hook rationale is the good
  kind — keep, tighten to one line where sprawling).

## Test coverage gaps to close alongside

- State-file concurrency test never actually runs two live writers concurrently.
- bin/argo.js hook-chain dispatcher (stdin replay, short-circuit, fail-closed
  unknown event) has no test file — but this is being rewritten by the
  hooks-to-npx wave; add coverage there.
