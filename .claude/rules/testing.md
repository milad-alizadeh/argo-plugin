# Testing Rules

## A test must fail before its implementation exists

Fail-first is what makes a test evidence rather than decoration: run the new test
before writing the code and watch it fail for the RIGHT reason (the missing
behaviour, not a typo). A test that has never been seen red proves nothing about
the code it guards. (Where probity is installed this order is enforced
mechanically; the rule stands regardless.)

### Working under probity — follow the protocol, don't get taught by blocks

Where probity is active it validates every Write/Edit against the session's own
test activity. Know its rules up front:

1. Test file first, **ONE new test per edit** — two tests in one edit is a
   violation, as is a new implementation file with no failing test on record.
   Parameterized tests count per ROW: an `it.each`/`test.each` with N rows is N
   tests — introduce it with one row and add rows one edit at a time.
2. Run that exact failing test **immediately before** the implementation edit.
   The guard reads the session's own activity, so a cached (e.g. turbo-cached)
   run that never spawns the runner produces nothing to validate against —
   invoke the test runner directly.
3. Match the failure stage: import/symbol failure → minimal stub only;
   assertion failure → just enough logic to pass that assertion.
4. Refactor only on green; don't add behaviour in a refactor edit.
5. If blocked, read the reason and supply the missing evidence — never batch,
   rename, or retry your way around a block.
6. **Map every implementation edit 1:1 to the NEWEST failing assertion** — the
   guard judges the edit against that assertion only, never your causal
   reasoning. If making test X pass requires changing a different call site
   ("the rehydrate test needs register() to set this field" WILL block), don't
   implement it from X's failure: first add a direct one-assertion red that
   pins that call site's own behavior, then implement against it.
7. Keep implementation edits comment-light while red: a comment describing
   OTHER behavior than the failing assertion reads as bundled anticipatory
   logic and draws over-implementation blocks even on a minimal code line.
   Add explanatory comments in a refactor edit on green.

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
- Verification IS looking at it: run the app (or a screenshot) and confirm
  existing suites stay green. That's the whole requirement.
- Where probity is installed, these edits are refactor-class: allowed on
  green, no new failing test required.
- The exemption ends where behavior begins: enabled/disabled, shown/hidden
  content, handlers, conditional rendering ARE behavior — normal TDD applies.
  A styling bug that broke a functional invariant (control unreachable,
  content clipped to invisible) may warrant a regression test asserting the
  INVARIANT (visible, clickable), never the geometry.

## Tests on the real interface are the primary surface

Verify a feature by exercising it through the surface a user actually touches —
the rendered UI via your e2e framework (Playwright, Cypress, WebDriver, …), or
the real API/CLI — and asserting on what the user sees or receives, not by
unit-testing logic in isolation. A feature isn't "tested" until a test drives it
through that real interface. Pure helper/unit tests are allowed where they add
value but never substitute for the through-the-interface check.

For machine-driven features, drive coverage off the machine via your machine
library's graph tools (e.g. `@xstate/graph` — enumerate reachable paths/events),
then prove each renders through the real interface — coverage comes from the
machine definition, not hand-picked cases.

### Assert the rendered UI, not the internal API/bridge call beneath it

When the app has an internal data/transport layer between the UI and its logic
(IPC in Electron, a GraphQL/REST client, a WebSocket bridge, a native bridge in
mobile, …), calling that layer directly from an e2e test and asserting on its
return value is NOT the same as proving the feature works — it proves the data
layer, not what the user sees. Wherever a rendered UI exists for the behaviour
under test, the e2e test MUST assert against that UI (`page.locator(...)`,
visible text, element state/class, screen reader tree, …) — a session starting
shows something on screen; a status change is visible; an error shows a visible
indicator. An internal-API-only check is a **unit test wearing an e2e
costume** — acceptable ONLY as a stand-in before the UI for that behaviour
exists yet (state so explicitly in the test's docstring, e.g. "no UI yet —
ships in a later slice"), and it must be replaced or supplemented with a real
UI assertion the moment that UI lands. Do not let an internal-layer check
quietly become the permanent proof of a shipped, user-facing feature.

## Every new feature ships with an edge-case matrix

A feature is not done until its plan/PR contains an **explicit edge-case matrix**
and a test exercises each row end-to-end through the real interface. "Test it
well" is not a matrix — enumerate the states. Do not hand-wave coverage; list the
cases, then drive each one.

Weigh each standing category below and include the rows that genuinely apply to
the feature — no n/a bookkeeping for the rest (forced rows on a feature with no
behaviour in that category produce fake tests, not coverage). Non-behavioral
changes (design tokens, config, pure styling) need no matrix at all:

- **Empty / zero state** — no items, first run, nothing selected.
- **Single vs many** — one item, and a crowded list (ordering, overflow, scroll).
- **Every terminal & parked state** — each failure / cancelled / done / conflict /
  awaiting-input status renders correctly *and* lands in the right surface.
- **Async in-flight** — the gap between intent and settle (submit, retry, fetch):
  the in-flight status must render before the await resolves, and failure must
  surface (never a silent dead control).
- **Interruption** — user acts mid-operation (mid-stream, mid-fetch); assert clean
  teardown, no stale straggler.
- **Switch / context change mid-flight** — switching target/panel while something
  is streaming; assert the old stream is dropped, not misattributed.
- **Persistence round-trip** — boot, reload, and state rehydration render
  identically to the live view with no live actor present.
- **Subscription lifecycle** — opening a detail/stream view subscribes; closing it
  unsubscribes (assert the source stops emitting — no leak).
- **Boot ordering** — the feature behaves before all dependencies are connected.
- **Alternate input paths** — if the feature is operable by more than one input
  path (e.g. keyboard, voice, API), a test drives each path, not just the default.

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
