# Testing Rules

## A test must fail before its implementation exists

Fail-first is what makes a test evidence rather than decoration: run the new test
before writing the code and watch it fail for the RIGHT reason (the missing
behaviour, not a typo). A test that has never been seen red proves nothing about
the code it guards. (Where Probity is installed this order is enforced
mechanically by reading the session transcript directly; the rule stands
regardless.) For the red-green-refactor loop itself — one vertical slice at a
time — see the `test-first` skill.

## Unit tests live next to the file they test

Co-locate every unit test with its subject: `src/hooks/red-proof-gate.js` is
tested by `src/hooks/red-proof-gate.test.js`, in the same directory — never in
a parallel tree (`test/hooks/...`) or a flat `test/` dump. The test is part of
the module: it moves, renames, and deletes with the file it proves, and a
reader who opens the directory sees the contract next to the code.

Exceptions that live in a dedicated `test/` (or equivalent) directory instead:

- **e2e-style suites** that drive the app/package surface as a whole rather
  than one module.
- **Acid/integration fixtures and harnesses** (fixture repos, corpus files,
  shared helpers) — these are shared infrastructure, not one module's test.
- **Path-anchored suites** whose location a tool or gate depends on (e.g.
  walker shims a vitest project globs by path).

Wire your runner's include globs to match both homes (e.g. vitest:
`['src/**/*.test.*', 'test/**/*.test.*']`).

## Cosmetic changes are looked at, not unit-tested

A cosmetic change only affects visual presentation — class/token values,
spacing, alignment, sizing, visual ordering, colors, typography, label copy —
with no logic change. For these:

- Do NOT write unit/component tests asserting pixel geometry (bounding boxes,
  computed px gaps, exact widths). They codify today's styles, break on the
  next legitimate restyle, and prove nothing a human glance doesn't.
- **Verification IS looking at it — and "looking at it" means an actual
  rendered artifact, not a proxy.** Run the app (or take a screenshot via a
  real browser/preview) and confirm existing suites stay green. A `grep`,
  `curl -I`, or any check of raw HTML/build-output *text* for the presence of
  a string is NOT looking at it — it cannot tell you whether CSS loaded,
  whether the page is readable, or whether the plan's own "visually confirm"
  instruction was honored, and reporting it as a visual check is misreporting
  verification that didn't happen. When a plan step says "visually confirm"
  or "preview," drive a real browser (or state plainly that you could not,
  per the no-UI-testing-claims rule everywhere else in this project) — never
  quietly downgrade to a text check and describe it as visual.
- **A cosmetic/visual change deployed to a real target must be checked against
  that target, not a same-machine stand-in.** A local dev server or preview
  build can differ from the deployed artifact in ways that matter (base path,
  CDN rewrites, environment config) — for any change that ships to a live
  URL, verification includes loading the actual deployed page post-deploy,
  not just a local build/preview.
- These edits are refactor-class under Probity: allowed on green, no new
  failing test required.
- The exemption ends where behavior begins: enabled/disabled, shown/hidden
  content, handlers, conditional rendering ARE behavior — normal TDD applies.
  A styling bug that broke a functional invariant (control unreachable,
  content clipped to invisible) may warrant a regression test asserting the
  INVARIANT (visible, clickable), never the geometry.

## Tests on the real interface are the primary surface

Verify a feature by exercising it through the surface a user or caller
actually touches — rendered UI, public API/CLI, or a proven state-machine
transition — not by unit-testing logic in isolation. Pure helper/unit tests
are allowed where they add value but never substitute for the
through-the-interface check. See the `test-first` skill for the full
technique, including machine-graph coverage and asserting against the real UI
rather than an internal data/transport layer.

## Every new feature ships with an edge-case matrix

A feature is not done until its plan/PR contains an explicit edge-case matrix
and a test exercises each row end-to-end through the real interface. "Test it
well" is not a matrix — enumerate the cases, then drive each one. Include only
the rows that genuinely apply (no n/a bookkeeping); non-behavioral changes
(design tokens, config, pure styling) need no matrix at all. See the
`test-first` skill for the standing category checklist.

## Every bug fix ships with a regression test

Add a test that would have caught the bug *before* writing the fix — it must fail
on the unpatched code and pass after. Name it after the bug (e.g. "regression:
retarget must not clip the first item"). The new case becomes a row in that
feature's edge-case matrix.

## Validate multi-step features before committing

For multi-step features (more than a single atomic edit), write the tests for what
you build AND run your lint + test suite from the repo root before considering the
work done. Both must pass clean before committing. Single-step changes are exempt.

## Environment flags

Use environment flags to make tests deterministic and offline:

- A **fake/replay flag** (e.g. `MY_BACKEND_FAKE=1`) so external services return
  deterministic canned responses; keep persistence and other local behaviour real
  so it stays testable.
- An **e2e-mode flag** (e.g. `MY_E2E=1`) the app/preload/fixtures can detect to
  switch into test-friendly behaviour.
