---
name: test-first
description: Test-driven development with a red-green-refactor loop, one vertical slice at a time. Tests verify behaviour through public interfaces, not implementation. Use when building a feature or fixing a bug test-first, or when the user mentions TDD / red-green-refactor.
---

# Test-First (Red-Green-Refactor)

**Core principle**: tests verify behaviour through public interfaces, not
implementation details. The implementation can change entirely; good tests
survive. A test that breaks when you rename an internal function — but behaviour
is unchanged — was testing the wrong thing.

"Behaviour through the public interface" means the surface a user or caller
actually touches: the rendered UI (via your e2e framework — Playwright, Cypress,
WebDriver, …), a public API/CLI, or a state-machine transition proven via your
machine library's graph tools (e.g. `@xstate/graph`) — not assertions on private
helpers. Pure helpers get unit tests where they add value, but they never
substitute for the through-the-interface check.

## Anti-pattern: horizontal slices

Do **not** write all the tests, then all the code. Bulk tests verify *imagined*
behaviour and the *shape* of things, not what the system does.

```
WRONG (horizontal):  RED: t1 t2 t3   GREEN: i1 i2 i3
RIGHT (vertical):    RED→GREEN t1→i1, then t2→i2, ...
```

## Loop

1. **Plan.** Orient first — map the area and read the relevant code (use a
   knowledge map if the project has one). Confirm with the user which behaviours
   matter most (you can't test everything) and what the public interface should be.
2. **Tracer bullet.** Write ONE test for ONE behaviour → watch it fail (RED) →
   minimal code to pass (GREEN). Proves the path end-to-end.
3. **Incremental.** For each remaining behaviour: RED → GREEN. One test at a
   time, only enough code to pass it, no speculative features.
   (Where Probity is active, the fail-first ORDER is enforced mechanically by
   reading the session transcript — this skill's job is the part a transcript
   can't check: slicing vertically and writing tests worth having.)
4. **Refactor — only while GREEN.** Never refactor while RED. Extract
   duplication, deepen modules, re-run the suite after each step.

## Per-cycle checklist

```
[ ] Test describes behaviour, not implementation
[ ] Test goes through the public interface (UI / machine / public fn)
[ ] Test would survive an internal refactor
[ ] Code is minimal for this test
```

Finish with your lint + test suite clean.

## Asserting through the real interface

For machine-driven features, drive coverage off the machine via your machine
library's graph tools (e.g. `@xstate/graph` — enumerate reachable paths/events),
then prove each renders through the real interface — coverage comes from the
machine definition, not hand-picked cases.

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

## Edge-case matrix categories

Weigh each category below and include the rows that genuinely apply to the
feature — no n/a bookkeeping for the rest (forced rows on a feature with no
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

<!-- Adapted from mattpocock/skills (MIT). -->
