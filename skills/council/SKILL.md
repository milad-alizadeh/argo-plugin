---
name: council
description: Generic multi-dimension review council with adversarial verification — seats review a target from distinct lenses, refuters try to kill each finding, a chair synthesizes the confirmed set. Model tiers are PINNED, never inherited from the session. Use for a merge-quality or design-quality review pass across several dimensions (correctness, security, structure, docs-accuracy, tests, perf) on any repo, path, or diff — not plugin-specific.
---

# Council (model-tiered, never-inherit)

Wraps a seats → verify → synthesize review as a `Workflow` script, mirroring
this plugin's own council workflows (one seat per dimension, N-lens adversarial
refutation per finding, a chair synthesis). Reusable across any project — the
target and dimension set are inputs, not baked in.

## Hard rule

**NEVER let a fan-out agent() call inherit the session model.** A council that
inherits runs every seat and every refuter at whatever tier the human happens
to be on — seats × findings × refuters is the real call volume, and refuters
dominate it. Pin `model:` explicitly on every `agent()` call, always.

## Model tiers (pinned per role)

| Role | Model | Why |
|---|---|---|
| Seats (dimension reviewers) | `sonnet` | needs real judgment to find defensible findings |
| Verifiers / refuters | `sonnet` | a refutation vote is only as good as the voter — a weak refuter kills real findings and passes bogus ones, which defeats the whole verify phase |
| Synthesis (chair) | `sonnet` | judgment; merges/ranks/writes the verdict |

`--cheap` demotes verifiers to `haiku` for low-stakes passes. Default stays
sonnet. There is no frontier tier here — councils are a volume review, not a
single hard call; if a finding needs frontier-grade judgment, escalate that
ONE finding by hand after the run, don't upgrade a whole tier.

Note on speed: council wall-clock is dominated by the verify fan-out queuing
through the per-workflow concurrency cap, not by model choice — demoting
verifiers to haiku barely speeds it up. To go faster, cut vote count or
findings volume, not the model tier.

## Escalate by result, not by tier

Only findings that survive discovery get sent to verification — that funnel
is the cost control, not model demotion. Escalate beyond the pinned tiers by
RESULT (a specific finding, a specific project) never blanket ("this whole
council needs frontier everywhere" is almost always wrong).

## Budget cap

- `MAX_FINDINGS_PER_SEAT` (default unbounded per seat, but log if any seat
  returns an outlier count — a seat dumping 40 findings is a prompt problem,
  not a real finding count).
- `VOTES_PER_FINDING` (default 2) and `REFUTATIONS_REQUIRED` (default 2, i.e.
  unanimous-refute kills a finding; `--thorough` raises votes to 3 for a
  majority rule) — these two numbers ARE the budget lever;
  council cost is `seats + Σfindings × VOTES_PER_FINDING + 1`. Log the tally
  in the return value.
- If dimension count or target size would blow the budget (e.g. a whole
  monorepo), scope the target down (a path/diff, not the repo) rather than
  quietly running unbounded.

## Dimensions (default set, override per call)

`correctness`, `security`, `structure`, `docs-accuracy`, `tests`, `perf` — pass
a subset or a superset; each becomes one seat with a dimension-specific prompt
grounded in the actual target (files to read, not vibes).

## Workflow-script skeleton

```js
export const meta = {
  name: 'council',
  description: 'Generic multi-dimension review council with adversarial verification.',
  phases: [
    { title: 'Review', detail: 'one seat per dimension (sonnet)' },
    { title: 'Verify', detail: 'N-vote adversarial refutation per finding (sonnet; --cheap → haiku)' },
    { title: 'Synthesize', detail: 'chair verdict (sonnet)' },
  ],
}

const THOROUGH = /--thorough\b/.test(String(args))
const CHEAP = /--cheap\b/.test(String(args))
const VERIFY_MODEL = CHEAP ? 'haiku' : 'sonnet'
const VOTES_PER_FINDING = THOROUGH ? 3 : 2
const REFUTATIONS_REQUIRED = 2

// Target + dimensions come from args: `<target> [dim1,dim2,...] [--thorough]`.
// Default dimensions if none given.
const DEFAULT_DIMENSIONS = ['correctness', 'security', 'structure', 'docs-accuracy', 'tests', 'perf']
const { target, dimensions = DEFAULT_DIMENSIONS } = parseArgs(args)

const FINDINGS_SCHEMA = {
  type: 'object', required: ['findings'],
  properties: { findings: { type: 'array', items: {
    type: 'object', required: ['title', 'severity', 'claim', 'evidence', 'suggestion'],
    properties: {
      title: { type: 'string' },
      severity: { enum: ['blocking', 'major', 'minor'] },
      claim: { type: 'string' },
      evidence: { type: 'string', description: 'file:line or quoted text grounding the claim' },
      suggestion: { type: 'string' },
    },
  }}},
}
const VERDICT_SCHEMA = {
  type: 'object', required: ['refuted', 'reasoning'],
  properties: { refuted: { type: 'boolean' }, reasoning: { type: 'string' } },
}

phase('Review')
const results = await pipeline(
  dimensions,
  dim => agent(
    seatPrompt(dim, target),
    { label: `seat:${dim}`, phase: 'Review', model: 'sonnet', schema: FINDINGS_SCHEMA }
  ).then(r => (r?.findings ?? []).map(f => ({ ...f, seat: dim }))),
  found => parallel(found.map(f => () =>
    parallel(Array.from({ length: VOTES_PER_FINDING }, (_, v) => () =>
      agent(refutePrompt(f, target, v), {
        label: `verify:${f.title.slice(0, 30)}`, phase: 'Verify', model: VERIFY_MODEL, schema: VERDICT_SCHEMA,
      })
    )).then(votes => {
      const valid = votes.filter(Boolean)
      const refutes = valid.filter(x => x.refuted).length
      return { ...f, refutes, survives: refutes < REFUTATIONS_REQUIRED }
    })
  ))
)

const all = results.filter(Boolean).flat()
const confirmed = all.filter(f => f.survives)
const killed = all.filter(f => !f.survives)

phase('Synthesize')
const synthesis = await agent(
  chairPrompt(target, dimensions, confirmed, killed),
  { label: 'chair-synthesis', phase: 'Synthesize', model: 'sonnet' }
)

return {
  target, dimensions, synthesis, confirmed, refutedCount: killed.length,
  stats: { seats: dimensions.length, findings: all.length, votesCast: all.length * VOTES_PER_FINDING, verifyModel: VERIFY_MODEL },
}
```

`seatPrompt`/`refutePrompt`/`chairPrompt` follow the shape of this plugin's own
council workflows: seat prompts ground the reviewer in the actual target
(files to read, what changed) plus a dimension-specific attack angle; refute
prompts re-check ONE finding against evidence/severity/relevance; the chair
prompt gets only `confirmed` findings plus `killed` for context, and produces
a ranked, deduplicated verdict.

## Checklist before running

- [ ] Every `agent()` call has an explicit `model:` — no bare fan-out call.
- [ ] `--thorough` only raises `VOTES_PER_FINDING`; `--cheap` only demotes
      `VERIFY_MODEL`. Nothing else changes per flag.
- [ ] Dimension set matches the target (drop `perf` for a docs-only diff, etc.)
      — don't run all six by reflex if a dimension is inapplicable.
- [ ] The returned `stats` block reports seats/findings/votes so cost is visible.
