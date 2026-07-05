# PRD template

The **product intent** for one feature — the durable WHAT and WHY, authored at
the top of the loop (in the host repo, e.g. `.claude/prds/<feature>.md`) and
cited by the wireframe, the hi-fi design, and the implementation plan. One PRD
per *feature* (a coherent unit of user value that may span several screens), not
per screen — each per-screen brief is a projection of this doc's feature→screen
matrix.

It carries what a wireframe and a plan both assume but neither states: *what this
feature must do and why*, written as **checkable requirements** so a downstream
verifier can rule each one present or absent without seeing the author's
reasoning. Keep it tight — a spec, not an essay.

Copy the sections below verbatim; fill them for the feature. Delete this header.

---

## Feature

One sentence: the user, their problem, the outcome this feature delivers.

**Grouping note:** why this is one feature (and not two), and which jobs it
deliberately does NOT cover.

## Why now / the core bet

Two or three sentences: the user need and the bet this feature makes. What
becomes true for the user that isn't true today. If it fails, which assumption
was wrong.

## Grounding — what already exists

The existing capabilities/surfaces this feature builds on or changes, each with a
citation (`ARCHITECTURE.md`, a prior PRD, a real surface/component). A requirement
that ignores these is a defect. Name what is reused vs net-new at the product
level.

## Requirements

Each requirement is a capability the feature MUST deliver. Stable id, one-line
statement, and an observable acceptance condition.

| ID  | Requirement (must deliver…)            | Acceptance (proven when…)                       |
| --- | -------------------------------------- | ----------------------------------------------- |
| R1  | …                                      | …                                               |
| R2  | …                                      | …                                               |

No vague requirements ("feels responsive", "handle edge cases"). If it isn't
observable, make it so or drop it.

## Feature → screen matrix

Which surface(s) realize each requirement. A requirement mapped to nothing is out
of scope or a missing screen — resolve it here.

| Requirement | Screen / surface        |
| ----------- | ----------------------- |
| R1          | …                       |
| R2          | …                       |

## Scope

- **In (this version):** the requirements above, bounded.
- **Out (deferred):** each with a one-line reason.
- **Cardinality & states that matter:** counts and the empty / loading / error /
  edge states design must cover (these are completeness the downstream gate can't
  invent — state them or they won't be built).

## Open product questions

Load-bearing product decisions still unresolved (answer A vs B changes *what*
gets built). Resolve with the user before the design/plan stages consume this —
do not park them for a downstream stage to silently assume.

## Handoff

- **Design branch:** wireframe (optional) → `figma-create`; the screen briefs
  project this doc's matrix columns; the design-verifier checks these
  requirements as the semantic completeness contract.
- **Code branch:** `argo:planner` → `build-plan`, citing these requirements.
