# Testing Rules

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

## Every new feature ships with an edge-case matrix

A feature is not done until its plan/PR contains an **explicit edge-case matrix**
and a test exercises each row end-to-end through the real interface. "Test it
well" is not a matrix — enumerate the states. Do not hand-wave coverage; list the
cases, then drive each one.

Every feature's matrix MUST consider these standing categories (include the rows
that apply; state "n/a" for the rest so the omission is deliberate, not forgotten):

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
