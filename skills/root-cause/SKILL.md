---
name: root-cause
description: A disciplined loop for hard bugs and performance regressions — build a feedback loop, reproduce, hypothesise, instrument, fix with a regression test, clean up. Use when something is broken/throwing/failing, a bug is reported, or a perf regression is described, and the cause is not obvious.
---

# Root-Cause a Bug

A discipline for hard bugs. Skip a phase only with an explicit reason.

Orient first: map the area and read the code that owns the failing behaviour
(use a knowledge map if the project has one) before grepping blindly.

## Phase 1 — Build a feedback loop (this is the skill)

A fast, deterministic, agent-runnable pass/fail signal for the bug is 90% of the
fix. Everything else just consumes it. Be aggressive and creative:

- A **failing test at the seam** that reaches the bug — prefer an end-to-end test
  through the real interface (the project's e2e framework / API / CLI), or a unit
  test where the bug is pure logic.
- For state-machine bugs, a path that drives the offending transition (e.g. via
  the machine library's graph tools).
- A **script against the running app/service** (a request, an event, a round-trip
  through the real boundary).
- Make it faster, sharper, more deterministic. A 2-second deterministic loop is
  a superpower; a 30-second flaky one is barely a loop. Pin time, seed RNG,
  isolate external services with the project's fake/replay flag.
- Non-deterministic bug? Raise the **reproduction rate** (loop the trigger,
  parallelise, add stress) until it's debuggable.

If you genuinely cannot build a loop, stop and say so — list what you tried and
ask for the missing artifact/access. Do not hypothesise without a loop.

## Phase 2 — Reproduce

Run the loop. Confirm it produces the **user's** failure mode (not a nearby one)
and that you captured the exact symptom for later verification.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable** hypotheses before testing any. Each states
its prediction ("if X is the cause, changing Y makes the bug vanish"). Show the
ranked list to the user — they often re-rank it instantly. Proceed if they're AFK.

## Phase 4 — Instrument

One variable at a time. Prefer a debugger/REPL breakpoint over logs; targeted
boundary logs over "log everything". **Tag every debug log** with a unique
prefix (`[DEBUG-a4f2]`) so cleanup is one grep. For perf, measure a baseline
first (a timer/profiler) then bisect — logs are usually wrong here.

## Phase 5 — Fix + regression test

Write the regression test **before** the fix, but only at a **correct seam** —
one that exercises the real bug pattern at the call site. If no correct seam
exists, that absence is itself the finding (flag it for architecture work). Every
bug fix should ship a regression test named after the bug, failing on the
unpatched code and passing after.

**Escalation rule: 3+ failed fix attempts on the same bug = stop fixing.** The
bug is no longer the finding — the architecture is. Question the design
assumption the failing fixes share (wrong boundary, wrong ownership, wrong
lifecycle), surface THAT as the diagnosis, and hand off to design work instead
of attempting a fourth patch.

## Phase 6 — Cleanup + post-mortem

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or the missing-seam finding is documented)
- [ ] All `[DEBUG-...]` logs removed (grep the prefix); throwaway harnesses deleted
- [ ] The correct hypothesis stated in the commit message
- [ ] The project's lint + test suite clean
- Then ask: what would have prevented this? If the answer is architectural, raise
  it as follow-up architecture work with specifics.

<!-- Adapted from mattpocock/skills (MIT). -->
