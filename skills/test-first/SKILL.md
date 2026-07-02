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
   (Where tdd-guard is installed, the fail-first ORDER is enforced mechanically
   by its hook — this skill's job is the part a hook can't check: slicing
   vertically and writing tests worth having.)
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

<!-- Adapted from mattpocock/skills (MIT). -->
