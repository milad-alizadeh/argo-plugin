---
name: research
description: Model-tiered deep-research fan-out — decompose a question into search angles, fan out web search/fetch/claim-extraction, adversarially verify claims, synthesize a cited report. Every phase's model is PINNED, never inherited from the session. Use when the user wants a deep, multi-source, fact-checked research report and wants the cost of the fan-out kept sane regardless of what model the session itself is running on.
---

# Research (model-tiered, never-inherit)

Wraps a deep-research fan-out as a `Workflow` script. The skeleton below mirrors
the plugin's own bundled `deep-research` workflow shape (Scope → Search → Fetch →
Verify → Synthesize) — adapt it to the question, don't hand-roll a new shape.

## Hard rule

**NEVER let a fan-out agent() call inherit the session model.** Inheriting means
"whatever tier the human happens to be running" — that is the token bomb: a
Fable/Opus session fanning out 20+ haiku-shaped search/fetch calls at Fable
pricing. Every `agent()` call in this workflow pins its own `model:` explicitly.
There is no bare `agent(prompt, { label, schema })` in this skill without a model.

## Model tiers (pinned per phase)

| Phase | Role | Model | Why |
|---|---|---|---|
| Scope | decompose question → search angles | `sonnet` | one call, needs real reasoning |
| Search | web search fan-out, one per angle | `haiku` | repetitive, high volume |
| Fetch | fetch + extract falsifiable claims | `haiku` | repetitive, high volume |
| Verify | N-vote adversarial claim verification | `sonnet` | judgment; cheaping this costs more in rework |
| Synthesize | merge/rank/write the report | `sonnet` | judgment |

`--deep` escalates **Synthesize only** to a frontier tier (Opus/Fable). Default
run never touches frontier. Escalating Search/Fetch/Verify is never correct —
if a haiku result looks wrong, re-run that one call, don't upgrade the whole tier.

## Budget cap

Fan-out scales to fit a fixed agent-call budget, not the other way around:

- `MAX_ANGLES` (default 5) caps Scope's output.
- `MAX_FETCH` (default 15) caps novel URLs fetched after dedup.
- `MAX_VERIFY_CLAIMS` (default 25) caps how many extracted claims reach the
  (expensive, sonnet) Verify phase — rank by importance/source-quality first,
  verify the top N, log how many were dropped.
- Total agent calls ≈ `1 (scope) + angles (search) + fetched (fetch) + claims × votes (verify) + 1 (synthesize)`
  — log this number in the return value so a caller can see the actual cost shape.

If the question needs more than the caps allow, narrow the question or run
`research` twice on sub-questions — don't quietly blow the caps.

## Workflow-script skeleton

```js
export const meta = {
  name: 'research',
  description: 'Model-tiered deep-research fan-out with adversarial verification.',
  phases: [
    { title: 'Scope', detail: 'decompose question into search angles (sonnet)' },
    { title: 'Search', detail: 'parallel web search, one agent per angle (haiku)' },
    { title: 'Fetch', detail: 'dedup URLs, fetch + extract claims (haiku)' },
    { title: 'Verify', detail: 'N-vote adversarial claim verification (sonnet)' },
    { title: 'Synthesize', detail: 'merge, rank, cite (sonnet; --deep escalates to frontier)' },
  ],
}

const MAX_ANGLES = 5
const MAX_FETCH = 15
const MAX_VERIFY_CLAIMS = 25
const VOTES_PER_CLAIM = 3
const REFUTATIONS_REQUIRED = 2
const DEEP = /--deep\b/.test(String(args))
const QUESTION = String(args).replace(/--deep\b/, '').trim()
const SYNTH_MODEL = DEEP ? 'opus' : 'sonnet' // frontier is opt-in, synth-only, never fan-out

phase('Scope')
const scope = await agent(
  `Decompose into up to ${MAX_ANGLES} complementary search angles.\n\nQuestion: ${QUESTION}`,
  { label: 'scope', model: 'sonnet', schema: SCOPE_SCHEMA }
)

phase('Search')
const searchResults = await pipeline(
  scope.angles.slice(0, MAX_ANGLES),
  angle => agent(SEARCH_PROMPT(angle), {
    label: `search:${angle.label}`, phase: 'Search', model: 'haiku', schema: SEARCH_SCHEMA,
  }),
  // Fetch fans out per novel URL as each search settles — no barrier.
  result => parallel(
    dedupNovel(result, MAX_FETCH).map(source => () =>
      agent(FETCH_PROMPT(source), {
        label: `fetch:${source.url}`, phase: 'Fetch', model: 'haiku', schema: EXTRACT_SCHEMA,
      })
    )
  )
)

const claims = rankClaims(searchResults.flat()).slice(0, MAX_VERIFY_CLAIMS)

phase('Verify')
const voted = await parallel(claims.map(claim => () =>
  parallel(Array.from({ length: VOTES_PER_CLAIM }, (_, v) =>
    () => agent(VERIFY_PROMPT(claim, v), {
      label: `verify:${claim.claim.slice(0, 30)}`, phase: 'Verify', model: 'sonnet', schema: VERDICT_SCHEMA,
    })
  )).then(verdicts => adjudicate(claim, verdicts, REFUTATIONS_REQUIRED))
))

phase('Synthesize')
const report = await agent(
  SYNTHESIS_PROMPT(voted),
  { label: 'synthesize', phase: 'Synthesize', model: SYNTH_MODEL, schema: REPORT_SCHEMA }
)

return { question: QUESTION, ...report, stats: { agentCalls: /* tally per above formula */ 0 } }
```

Fill in the `*_SCHEMA`, `*_PROMPT`, `dedupNovel`, `rankClaims`, `adjudicate` helpers
per the question — copy the structured-output-schema shape and dedup/rank logic
from the plugin's bundled `deep-research` workflow (Scope/Search/Fetch/Verify/
Synthesize + URL-dedup + importance/quality ranking) as the reference implementation;
this skill's only addition is pinning `model:` on every single `agent()` call.

## Checklist before running

- [ ] Every `agent()` call has an explicit `model:` — grep the script for
      `agent(` calls missing `model:` before running it.
- [ ] `--deep` only changes `SYNTH_MODEL`, nothing else.
- [ ] Caps (`MAX_ANGLES`/`MAX_FETCH`/`MAX_VERIFY_CLAIMS`) are set, not left to
      grow unbounded with search-result count.
- [ ] The returned `stats` block reports actual agent-call count so cost is visible.
