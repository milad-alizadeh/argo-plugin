# Research + Council roles (model-tiered, never-inherit)

Two reusable, discoverable plugin surfaces the user reaches for often, with
models PINNED in the definition so they never inherit the session model (the
token bomb: a council inheriting = every seat runs on Fable). Grounded in
model-routing research (route by task novelty; cheap the fan-out volume, never
the synthesis/verification) and the existing council-agents-on-sonnet /
model-tiering-by-role memories.

## Hard rule (both)
NEVER inherit the session model for fan-out agents. Every role pins its own
tier. Frontier (Fable/Opus) is opt-in only, for a single synthesis step, never
the fan-out.

## `research` skill (wraps the deep-research workflow)
Per-phase model pinning:
- decompose / plan angles → sonnet (one call, needs reasoning)
- search + fetch + extract-claims fan-out → haiku (repetitive, high volume)
- adversarial verify (N-vote) + synthesize → sonnet (judgment; cheaping this
  costs more in rework — the documented cost trap)
- `--deep` flag escalates synthesis to Fable/Opus; default never does.
- Budget cap via Workflow `budget`; fan-out scales to fit.

## `council` skill (generic, wraps the plugin-council workflow shape)
Default tiers (verifiers are the call-VOLUME in a council: seats × findings ×
refuters, so they dominate cost — cheap them):
- seats (dimension reviewers) → sonnet
- verifiers / refuters → haiku (refutation is narrower than discovery)
- synthesis → sonnet
- Overridable per-run; `--thorough` promotes verifiers to sonnet.
- Cheap-first-then-escalate: fan-out cheap, only surviving findings get the
  next-tier verify. Escalate by RESULT, not blanket.
- Budget cap declared; council cannot run unbounded.

## Why skills, not hand-crafted each time
Today these are hand-run with models hand-pinned from memory — easy to forget
and silently inherit Fable. First-class skills make the tiering structural and
the capability discoverable (/argo:research, /argo:council).

## Decision
Default council = sonnet seats / haiku verifiers (cheapest defensible;
verifiers dominate call volume). `--thorough` for sonnet verifiers.

## Non-goals
No trained/dynamic router (YAGNI) — static per-role tiers are enough and
predictable. Revisit only if a real task needs adaptive routing.
