# Prompt-surface evals

Behavioral evals for the plugin's prompt surfaces: `agents/*.md`,
`skills/*/SKILL.md`, and `templates/rules/*.md`. Each eval loads the CURRENT
markdown file(s) from disk (never a pasted copy — see
`evals/lib/loadPrompt.mjs`), spawns the real `claude` CLI with that content as
system prompt against a scenario, and scores the response deterministically.

This directory is separate from `eval/` at the repo root, which covers the
SessionStart routing card (`hooks/session-context.mjs`), not prompt-surface
files.

## What each eval covers

| Eval | Prompt surface | Behavior under test |
|---|---|---|
| `builder-guard-protocol` | `agents/builder.md` | Runs the failing test before editing, or splits a multi-test edit — never batches tests/implementation with no fresh red evidence. |
| `designer-leaf-rule` | `agents/designer.md` | Refuses to spawn/delegate to a sub-agent (the LEAF/R1 rule) even when a large or multi-part job tempts it. |
| `reviewer-verdict-shape` | `agents/reviewer.md` | Leads with a verdict token (pass/fail/needs-input) and cites at least one `path:line` finding. |
| `test-first-choreography` | `skills/test-first/SKILL.md` | Proposes exactly ONE failing test before any implementation (vertical slice, not a horizontal batch). |
| `playbook-stage-discipline` | `skills/design-screen/SKILL.md` | Queues a `component-edit` playbook run for a PRD-changed component instead of editing the component master inline. |
| `anti-spiral` | `agents/builder.md` (anti-spiral callout) | On the 3rd consecutive failure at the same symptom, proposes researching online before a 4th attempt. |

Each eval file has 2-4 scenario cases and a deterministic string/regex scorer
(see `evals/lib/scorers.mjs`) — no LLM judge is used in this initial set,
since every behavior here is checkable by pattern match. If a future eval
needs an LLM judge, wire it through the same `spawnClaude` seam so it's still
serial and injectable in harness tests.

## How to run

```
bun run eval:prompts                       # every eval in evals/
bunx evalite run evals/builder-guard-protocol.eval.ts   # one eval
```

Requires the on-device, subscription-authed `claude` CLI on `PATH` (no
`ANTHROPIC_API_KEY` — the CLI picks up local auth). `evalite.config.ts` at
the repo root applies to these evals too (`maxConcurrency: 1`,
`testTimeout: 90_000`).

## SERIAL ONLY

Every eval spawns `claude --print` for real. This machine has one
subscription seat: running spawns concurrently — even a handful — bursts the
account's server-side rate limit and can take down every other agent
currently running under the same login. Two independent guarantees enforce
this:

1. `evalite.config.ts`'s `maxConcurrency: 1`.
2. `evals/lib/spawnClaude.mjs`'s `createSpawnClaude()` chains every call
   through one queue, so at most one `claude` process is ever in flight
   regardless of how evalite/vitest schedules the dataset.

Never run these in parallel with another eval suite, a build-plan session,
or anything else using the same `claude` login.

## Not part of `npx vitest run` / CI

These evals spawn a real model and are **manual or nightly only** — never
wired into `bun run test`, lefthook, or any CI workflow. The one exception is
`evals/harness.test.mjs`, a pure unit test (fake runner, no model spawn) that
proves the loader + spawner + scorer pipeline works; it runs under
`bun run test` like any other test in the repo.

## Structure

```
evals/
  README.md                          this file
  harness.test.mjs                   unit test, fake runner, runs under `bun run test`
  lib/
    loadPrompt.mjs                   reads prompt-surface md fresh from disk
    spawnClaude.mjs                  injectable claude --print runner, serialized
    scorers.mjs                      deterministic scorers, one per eval
  builder-guard-protocol.eval.ts
  designer-leaf-rule.eval.ts
  reviewer-verdict-shape.eval.ts
  test-first-choreography.eval.ts
  playbook-stage-discipline.eval.ts
  anti-spiral.eval.ts
```
