# Documentation Content

What docs contain and how they're organized. `documentation-style.md` governs
the sentence level; this rule governs everything above it: grounding, IA,
what earns a page, and where facts live. These are rules, not aspirations —
if a docs change violates one, it's wrong. Derived from how Playwright,
Turborepo, Nx, Biome, Astro, and Tailwind structure their docs (evidence:
the argo repo's `.argo/design/docs-content-strategy-research.md`).

## Ground before you write (the facts inventory)

- **Required:** before generating or substantially rewriting docs prose, build
  or refresh a **facts inventory** at `.argo/design/docs-facts.md` — a deep
  read of the actual source (skill/command bodies, config schemas, gate
  implementations), never just READMEs and frontmatter. It contains, with a
  `file:line` (or file-section) source per fact:
  1. **Supported matrix** — what is implemented vs experimental vs planned,
     extracted from source/registries, not from marketing copy;
  2. **Requirements & prerequisites** — external-service plan tiers, required
     binaries, version floors, auth constraints;
  3. **Journey traces** — the real end-to-end steps of each core workflow,
     traced through the code that implements them;
  4. **Boundaries** — what is a separate product or explicitly retired, so
     exclusion is deliberate.
- **Required:** every claim in a docs page traces to an inventory line; every
  inventory line traces to the repo. A claim with no backing line is the bug.
- **Forbidden:** generating docs prose from surface artifacts alone (README,
  frontmatter descriptions). If the inventory is missing or stale against
  HEAD, build it first — that's the point of it.

## Two tiers, hard wall (IA)

- **Required:** exactly two content tiers — an opinionated **journey/guides**
  tier (hand-written) and a **reference** tier (templated, generated from the
  same metadata the tooling executes wherever it exists). Every reference
  entry is reachable from a guide; every guide links into reference for depth.
- **Forbidden:** a top-level "Explanation"/"Concepts" section duplicating what
  a guide already says. Explanation lives inside the guide that needs it, or
  in ONE small concepts cluster (a handful of pages at most) — never both.
- **Forbidden:** hand-writing reference content that exists as
  machine-readable metadata (a command's description, a config key's default).
  Generate or import it; hand-written copies drift.

## N similar items: index first, page only when earned

- **Required:** N similar things (commands, rules, plugins, config keys) get
  ONE index surface: a table of *name | one-line description | status badges*,
  grouped by family, with a badge legend (✅ stable / 🟡 experimental /
  ⌛ planned / 🚫 not planned).
- **Required:** a full page for an item ONLY when the page answers a question
  the table row cannot — its own examples, failure modes, workflow, or
  configuration. Write the table row first; if the row plus a reference
  anchor covers it, the page is forbidden.
- **Required:** items that do earn pages follow ONE fixed template per family
  (metadata block: status, requirements → what it does → example →
  configuration → see-also). Divergence from the family template is the bug.
- **Forbidden:** a page per config key or per CLI flag — config keys share one
  reference page with per-entry headings and a `Default:` line.
- **Forbidden:** absorbing third-party/host-stack surfaces as pages — link
  out, don't absorb.

## Requirements & supported matrix (one page, one place)

- **Required:** ONE "Requirements & support" page under Getting Started (never
  under Reference): host version floors stated as pins or dated policy (never
  "recent versions"), external-service plan tiers per capability, and the
  capability × status matrix using the badge legend above.
- **Required:** version floors also appear inline at the top of the install
  page — one sentence, linking to the matrix.
- **Forbidden:** compatibility facts scattered across feature pages with no
  central matrix. A feature page may restate its own requirement but links to
  the matrix as the source of truth.
- **Forbidden:** documenting a planned/unimplemented capability without its
  status marker — a reader must never discover "not built yet" by trying it.

## Guides derive from journeys, not the feature list

- **Required:** the guides tier is an ORDERED journey arc (install → first
  success → each core workflow → shipping), each page one user goal, second
  person, real commands and real output, ending with an explicit next-step
  handoff. A guide page with no next step is incomplete.
- **Forbidden:** deriving guides by enumerating features ("The Hooks Guide")
  when no user journey starts there — such a feature is documented inside the
  journey that encounters it, plus a reference entry.
- **Forbidden:** a journey page exceeding one sitting (~2,000 words) — split
  where the user would naturally stop and verify.

## The entry-point page

- **Required:** the first docs page is a small HUB: one paragraph of what the
  product is, the install command, and 3–4 pathway cards by reader intent.
  The first successful command is reachable within the first screen of the
  first journey page.
- **Forbidden:** the entry page carrying the mental-model essay or feature
  tour — those are links from it.

## Workflow visualization

- **Required:** the pipeline gets ONE canonical diagram on the concepts page,
  reused by reference, never redrawn per page. Pipelines read left to right.
- **Required:** "what the user actually sees" moments (a gate blocking, a
  verdict) are shown as real captured output, not described in prose.
- **Forbidden:** decorative diagrams restating a linear step list — if the
  flow is linear, a numbered Steps list IS the diagram.

## Self-check before you finish a docs change

1. Does every new claim trace to a facts-inventory line (and the inventory to
   the repo)?
2. Does any new page fail the threshold test (a table row would have
   sufficed)?
3. Is any requirement stated without a link to the matrix page?
4. Does every touched guide page still end with a next step?
5. Does any experimental/planned item lack its status badge anywhere it
   appears?

Any "yes" → fix it before reporting done.
