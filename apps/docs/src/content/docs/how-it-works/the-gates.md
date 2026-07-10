---
title: The gates
description: How Argo's stage checkpoints actually enforce themselves.
---

Argo has two kinds of gates, and the difference matters.

## Deterministic gates

A deterministic gate is code, not a model judgment. It reads a receipt off disk, checks a fact against the real filesystem or git state, and returns pass or block — the same input always produces the same output.

- **Probity** enforces red-first TDD at the edit level: a test must be seen failing, for the right reason, before the implementation that makes it pass.
- **Commit gates** (the red-proof gate, the trust gate) read a receipt file the build session wrote — a red exit code, a green exit code, a timestamp that postdates HEAD — and block the commit if the receipt is missing, stale, or doesn't match the staged diff.
- **Design-rules audits** check a live Figma build against a fixed rule set: base instances, semantic bindings, Auto Layout, naming conventions — mechanically, not by asking a model to remember the style guide.
- **Spec-diff and instance-presence checks** compare generated code or a Figma build against the synced source of truth, byte for byte or node for node.

## Judge gates

A judge gate asks a model a bounded question and treats the answer as a verdict, not a rubber stamp. The design-verifier, for example, sees only a PRD's requirements and a screenshot — never the build transcript, never the arrangement notes — and rules each requirement present or absent. That isolation is deliberate: a judge that has seen how the build happened tends to rationalize it, not evaluate it.

## Why both

Deterministic gates catch what's checkable: did the test fail first, does the receipt exist, does the generated file match its source. Judge gates catch what isn't: does this screen actually satisfy the PRD, does this diff introduce a real bug. Neither substitutes for the other — a build that only had judge gates would drift on anything a model doesn't think to check; a build that only had deterministic gates would ship code that passes every receipt while missing the point.

Continue to [the trust model](/how-it-works/the-trust-model/) for how these gates compose into something a maintainer can actually rely on without re-reading every diff.
