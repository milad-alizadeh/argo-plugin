---
name: spike
description: Build a throwaway prototype (a "spike") to answer a design question before committing to it — a runnable harness for state/logic questions, or several radically different UI variations for "what should this look like". Use when the user wants to spike or prototype something, sanity-check a data model or state machine, or explore design options.
---

# Spike (Throwaway Prototype)

A spike is **throwaway code that answers a question**. The question decides
the shape. Identify it from the prompt, the surrounding code, or by asking.

- **"Does this logic / state model feel right?"** → a tiny runnable harness
  (a script or a focused unit spec) that pushes the state model or pure logic
  through the cases that are hard to reason about on paper. After every step,
  print the full relevant state.
- **"What should this look like?"** → several radically different UI variations
  on one throwaway route/component, switchable from a floating selector. Obey your
  design system's tokens and primitives, whatever they are — a prototype that
  ignores them teaches you the wrong thing.

## Rules

1. **Throwaway from day one, clearly marked.** Locate it next to the real
   module/component it's spiking; name it so no one mistakes it for production.
2. **One command to run** (a single script or test invocation).
3. **No persistence, no polish.** In-memory state, no tests, no abstractions.
4. **Surface the state** after every action or variant switch.
5. **Delete or absorb when done.** Keep only the *answer* — capture it in a
   design doc or decision record, then delete the prototype.
6. **Disable TDD enforcement for the session.** A spike's "no tests, throwaway"
   contract is incompatible with tdd-guard by design — if the project has
   tdd-guard installed, toggle it off for this session (`tdd-guard off` /
   its session toggle) before spiking, and say you did. Re-enable (or just end
   the session) when the spike is deleted or absorbed.

<!-- Adapted from mattpocock/skills (MIT). -->
