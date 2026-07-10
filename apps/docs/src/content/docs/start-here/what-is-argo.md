---
title: What is Argo
description: An overview of the Argo way of working for Claude Code.
---

Argo turns Claude Code into an opinionated development pipeline. Every stage of product, design, code, and shipped work is owned by a skill or agent, and the seams between stages are guarded by mechanical gates — so quality is enforced, not requested.

## Two pieces

Argo ships as two pieces that install together:

- **The plugin** — the thin Claude-facing layer: skills, agents, and hook wiring.
- **`@argohq/toolkit`** — one npm package holding every line of executable logic: gate implementations, the design kit, test walkers, reporters, and the `argo` CLI. Hooks dispatch into it fail-closed — if the toolkit is missing, a gate blocks and names the fix. It never silently passes.

## Opinionated about process, agnostic about stack

Argo is safe to drop into an existing project and an excellent default for a greenfield one. It works with or without the Argo cockpit app, and it adapts to whatever stack a project already uses rather than imposing one.

## The canonical loop

At a glance, a feature travels through:

1. **Product** — write a PRD (what and why), grill it until every decision is settled.
2. **Design** — for UI-facing work, a brief becomes a hi-fi Figma build, checked by a deterministic design-rules audit and an adversarial design-verifier.
3. **Code** — the design (or the plan, for non-UI work) is built test-first, one vertical slice at a time, with every commit gated by receipts.
4. **Review and land** — a merge-gate review, then a pull request or a direct merge depending on the project's landing mode.

Each handoff has a defined input, a defined output, and a gate that must pass before the next stage starts. Nothing downstream gets built on an ungated upstream.

## What makes it trustworthy

The gates are the point. Probity enforces red-first TDD at the edit level. Commit gates check receipts — a red-proof of the failing test, a green-proof of the passing one — before code lands. Deterministic design-rules audits catch drift in a Figma build mechanically, not by asking a model to remember a style guide.

Continue to [install and first run](/start-here/install-and-first-run/) to get Argo running on a project.
