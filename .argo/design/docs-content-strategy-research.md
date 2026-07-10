# Docs Content Strategy — Research & Rules

Research into how the best opinionated developer-toolchain products structure
their documentation, to inform Argo's docs content strategy. Part 1 is the
per-product evidence (fetched from the live docs sites, July 2026). Part 2 is
the synthesized strategy, written as checkable rules in the style of
`templates/rules/engineering-principles.md`.

Argo context the strategy must serve: a Claude Code plugin that turns Claude
Code into a gated development pipeline — skills (verbs), agent roles, hooks,
deterministic gates (TDD/red-proof/trust), and a Figma-to-code design pack —
with a supported-matrix problem (Claude Code version, host stack, Figma plan,
what's stable vs experimental) and an N-similar-things problem (many skills,
many agents, many gates, many config keys).

---

## Part 1 — Research findings

### Playwright (playwright.dev/docs)

1. **Page vs table.** Two-tier split: conceptual guides get one page per
   capability (Actions, Assertions, Authentication, …); the API reference gets
   one page per *class* (~50+: Page, Locator, …) with each method a heading —
   never a page per method. N small similar things become indexed tables on
   one page: the Assertions guide ([/docs/test-assertions](https://playwright.dev/docs/test-assertions))
   is three tables (`assertion → one-line description`), each row linking into
   the API class page for depth. Threshold in practice: own page when the
   thing is class-sized (many members, own examples); table row + reference
   anchor when it's one signature + one sentence.
2. **Requirements.** No standalone page — "System requirements" is the last H2
   of the Installation page ([/docs/intro](https://playwright.dev/docs/intro)):
   a terse bullet list (Node 22.x/24.x/26.x, Windows 11+, macOS 14+, named
   Debian/Ubuntu releases). Experimental APIs live in an "Experimental" sidebar
   group; every API member carries "Added in v1.x" inline.
3. **Guides.** Journey-based Getting Started (~7 pages in strict onboarding
   order: Installation → Writing tests → … → CI) then 20+ feature-based
   guides. First page: install page, high code density, tabbed package-manager
   commands, ends with "What's next" links — every getting-started page ends
   with that same handoff.
4. **Visualization.** Annotated screenshots of real tool UI (trace viewer,
   HTML report); no abstract diagrams. Step lists + code carry the workflow.
5. **Diátaxis.** Getting Started = tutorial, Guides = how-to (explanation
   blended in), API = pure reference. No standalone explanation section; dense
   two-way guide↔reference cross-linking makes the blend work.
6. **Voice.** Second person, imperative, reassuring: "Playwright automatically
   waits for actionability checks to pass… You don't need to add manual
   waits." Warnings are inline bolded prose, soft-normative: "test runner
   options are **top-level**, do not put them into the `use` section."

### Turborepo (turborepo.dev/docs)

1. **Page vs table.** turbo.json config = ONE page with every option as a
   heading ([/docs/reference/configuration](https://turborepo.dev/docs/reference/configuration));
   CLI commands = one page each (each has its own flags, examples, workflow).
   The reference index is a card grid (Configuration / Commands / Packages).
2. **Requirements.** A dedicated **Support Policy** page under Getting Started
   ([/docs/getting-started/support-policy](https://turborepo.dev/docs/getting-started/support-policy)):
   package-manager table with a Stable status column, Node support stated as a
   *policy* ("Active and Maintenance LTS") rather than pins, platform binary
   list, and an LTS table with dated EOLs. Experimental config options carry an
   inline ExperimentalBadge next to the heading.
3. **Guides.** Explicitly journey-based: "Crafting your repository" is an
   11-page ordered arc ("From zero to `turbo`"), each page handing off to the
   next. The getting-started entry page is deliberately tiny: install commands
   + a four-card "choose your learning path" matrix.
4. **Visualization.** Custom comparative diagrams (sequential vs parallel task
   timelines) that *argue the value prop*, plus file-tree renders and tabs.
5. **Diátaxis.** Tutorial/how-to/explanation blended inside the journey, hard
   wall to pure reference. Works because the journey is short enough (11
   pages) to double as the explanation layer.
6. **Voice.** Second person, benefit-forward at the top, precise in reference.
   Typed callouts (info/warn/error) with consequence-first wording: "This
   means that your `.gitignore` file will no longer be respected."

### Nx (nx.dev/docs)

1. **Page vs table.** ~30+ plugins, each with many generators/executors — and
   NO page per generator. Each plugin gets a small prose area plus two
   schema-generated reference pages (`…/generators`, `…/executors`) listing
   every item inline with a 4-column options table (Option | Type |
   Description | Default) — e.g. [nx.dev/docs/technologies/react/generators](https://nx.dev/docs/technologies/react/generators).
   The plugin family is a card index ([nx.dev/technologies](https://nx.dev/technologies));
   third-party plugins are pushed to an external registry entirely.
2. **Requirements.** Weak — compatibility lives scattered in per-plugin intro
   pages; no central matrix was discoverable. (A gap to avoid, not copy.)
3. **Guides.** Journey-based getting started (problem → solution → per-persona
   "Where to go from here"), then feature pages that hybridize how-to +
   explanation with videos ([nx.dev/docs/features/cache-task-results](https://nx.dev/docs/features/cache-task-results)).
4. **Visualization.** Heavy: project-graph/task-graph diagrams on the
   mental-model page ([nx.dev/concepts/mental-model](https://nx.dev/concepts/mental-model)),
   embedded videos on feature pages. Diagrams are core to explaining the
   pipeline.
5. **Diátaxis.** Getting Started / Features / Concepts / generated reference —
   explicit-ish quadrants; reference is machine-generated from schemas so it
   never drifts.
6. **Voice.** Marketing-tinged but concrete; caveats stated as reasoning:
   "e2e test runs that hit the backend API cannot be cached as the backend
   might influence the result."

### Biome (biomejs.dev)

1. **Page vs table.** 509 lint rules: per-language index tables
   ([biomejs.dev/linter/javascript/rules/](https://biomejs.dev/linter/javascript/rules/))
   grouped by named group (a11y, correctness, nursery, …), three columns —
   rule link | one-line description | emoji property badges (recommended,
   safe/unsafe fix, experimental) — AND a template-generated full page per
   rule ([no-array-index-key](https://biomejs.dev/linter/rules/no-array-index-key/)):
   metadata block ("Rule available since v1.0.0", recommended?, severity,
   sources), invalid examples with diagnostics, valid examples, config
   snippet, source links. N pages are justified because each rule carries
   examples + rationale; the index carries the scan/compare job.
   Config reference is one huge page with dotted-path headings and
   `> Default:` lines ([biomejs.dev/reference/configuration/](https://biomejs.dev/reference/configuration/)).
2. **Requirements.** The strongest matrix seen: **Internals > Language
   support** ([biomejs.dev/internals/language-support/](https://biomejs.dev/internals/language-support/)) —
   Language | Parsing | Formatting | Linting | Plugin Support, legend
   "✅ Supported / 🚫 Not in progress / ⌛️ In progress / 🟡 Experimental".
   Stability signaled three ways: nursery group placement, per-page "available
   since vX", experimental badge in the index legend.
3. **Guides.** Task-based and short; getting-started is install → init → run →
   next steps, ending "Success! You're now ready to use Biome."
   Sidebar: Guides, Formatter, Analyzer, Reference, Recipes, Internals.
4. **Visualization.** Minimal — code blocks and diagnostics output.
5. **Diátaxis.** Clean: Guides/Recipes (how-to), Reference + rule pages (pure
   generated reference), Internals (explanation: philosophy, versioning,
   language support).
6. **Voice.** Terse, second-person, engineering-plain, rationale-carrying:
   "`-E` ensures that the package manager pins the version of Biome" — with a
   link to *why* pinning matters.

### Astro docs (docs.astro.build — Starlight's reference implementation)

1. **Page vs table.** Split by *ownership*, not count: every official
   integration gets a full guide page (reached from a categorized card index,
   [guides/integrations-guide](https://docs.astro.build/en/guides/integrations-guide/));
   community integrations get NO pages — pushed to an external searchable
   directory. Configuration reference is one long page with fixed anatomy per
   entry: heading → type → default → version added → description → example →
   see-also ([reference/configuration-reference](https://docs.astro.build/en/reference/configuration-reference/)).
2. **Requirements.** Version floors at the top of the install page ("Node.js
   v22.12.0 or higher, odd-numbered versions excluded") — in the how-to entry
   point, not a separate page; per-integration compatibility on each
   integration page.
3. **Guides.** Getting-started is a **hub, not a tutorial**: hero, CTAs, three
   pathway cards. The blog Tutorial is explicitly journey-based with a
   progress tracker and per-page completion checkboxes.
4. **Visualization.** Concept diagrams (islands page), Steps component,
   FileTree component for directory structure.
5. **Diátaxis.** Verified in the sidebar: Tutorial / Guide / Reference /
   Ecosystem — the four quadrants, with explanation folded into Guide as a
   Concepts cluster.
6. **Voice + Starlight components in the wild.** Second person, encouraging;
   caution aside verbatim: "Astro must be installed locally, not globally."
   Components actually used on real pages: Tabs (package managers), Asides
   (note/tip/caution), Steps, Cards/CardGrid, FileTree, tutorial checklists.

### Tailwind CSS (tailwindcss.com/docs)

1. **Page vs table.** ~150+ pages, one per *CSS property family* (not per
   class): `padding` is one page for ~11 prefixes. Every page follows a rigid
   template ([docs/padding](https://tailwindcss.com/docs/padding)): quick-ref
   class→CSS table at top, examples, custom values, responsive boilerplate,
   theme customization — with the boilerplate always *linking* to the single
   Core Concepts page instead of duplicating variant docs.
2. **Requirements.** A dedicated **Compatibility** page under Getting Started
   ([docs/compatibility](https://tailwindcss.com/docs/compatibility)): browser
   floors plus opinionated tooling stances ("you shouldn't use Tailwind with
   Sass…").
3. **Guides.** No tutorial track at all; /docs lands on Installation which
   fans into method tabs; the Vite path is a numbered 6-step sequence ending
   with a fallback link ("Are you stuck? Check our framework guides…").
4. **Visualization.** No diagrams; rendered live demos beside code everywhere.
5. **Diátaxis.** Deliberately two-tier: thin conceptual layer (Core Concepts,
   9 pages) + massive uniform reference. Works because how-to is folded into
   the reference template and cross-cutting concepts are written exactly once.
6. **Voice.** Confident, second person, preemptively reassuring: "Don't panic!
   In practice this isn't the problem you might be worried it is…";
   prescriptive: "you should just never add two conflicting classes to the
   same element."

### Cross-cutting patterns (all six)

- **Two-tier IA everywhere:** an opinionated journey/guides layer + an
  exhaustive templated reference layer, densely cross-linked. Nobody ships a
  standalone Diátaxis "explanation" quadrant as a top-level peer; explanation
  is folded into guides (Playwright, Turborepo, Astro) or a small
  Concepts/Internals cluster (Nx, Biome, Tailwind).
- **Page-vs-table threshold is consistent:** an item earns its own page only
  when it carries its own examples, rationale, or workflow; one-signature
  items are a table row linking to a reference anchor.
- **Reference is generated from machine-readable metadata** wherever N is
  large (Nx schemas, Biome rule metadata) — hand-written prose is reserved for
  guides and concepts.
- **Requirements live near installation** (Playwright H2, Astro top-of-page,
  Turborepo/Tailwind dedicated page under Getting Started) — never buried in
  reference. The best matrices are tables with an explicit status legend
  (Biome) and policy statements with dates (Turborepo).
- **Every tutorial/getting-started page ends with an explicit next step.**
- **Warnings are short, typed, and consequence-first**, stated as reasoning
  ("…because the backend might influence the result"), never shouting.

---

## Part 2 — Documentation content strategy (checkable rules)

These are rules, not aspirations — if a docs change violates one, it's wrong.
Stated as forbidden/required lists because you can pattern-match a violation.
They bind every docs surface Argo ships: the Starlight site, README-level
docs, and generated reference pages alike.

### Two tiers, hard wall (IA)

- **Required:** exactly two content tiers — an opinionated **journey/guides**
  tier (hand-written) and a **reference** tier (templated, ideally generated
  from the same metadata the toolkit executes: skill frontmatter, gate
  definitions, config schema). Every reference entry is reachable from a
  guide, and every guide links into reference for depth.
- **Forbidden:** a top-level "Explanation"/"Concepts" section that duplicates
  what a guide already says. Explanation lives inside the guide that needs it,
  or in ONE small concepts cluster (≤ a handful of pages: the pipeline mental
  model, the gating philosophy) — never both.
- **Forbidden:** hand-writing reference content that exists as machine-readable
  metadata (a skill's description, a config key's default, a gate's trigger).
  Generate it or import it; hand-written copies drift.

### N similar items: index first, page only when earned (the threshold rule)

- **Required:** N similar things (skills, agents, gates, hooks, config keys)
  get ONE index surface: a table with columns *name (link/anchor) |
  one-line description | status badges* — grouped by family, with a badge
  legend (stable / experimental / requires-X), Biome-style.
- **Required:** a full page for an item ONLY when the page answers a question
  the table row cannot — the item has its own examples, failure modes,
  workflow, or configuration. Test before creating the page: write the table
  row first; if the row plus a reference anchor covers it, the page is
  forbidden.
- **Required:** when an item does earn a page, every such page follows ONE
  fixed template for its family (metadata block up top: since-version, status,
  requirements → what it does → example → configuration → see-also),
  Biome-rule-page-style. Divergence from the family template is the bug.
- **Forbidden:** a page per config key or per CLI flag. Config keys share one
  reference page with dotted-path headings and a `Default:` line per entry
  (Turborepo/Biome/Astro pattern). Commands/verbs with their own flags,
  examples, and workflow (Argo skills like `/argo:build-plan`) MAY each get a
  page — that's the Turborepo CLI-command exception, and it must pass the
  threshold test above.
- **Forbidden:** documenting third-party/host-project surfaces (the user's own
  stack, community extensions) as pages in Argo's docs — link out, don't
  absorb (Astro's ownership rule).

### Requirements & supported matrix (one page, one place)

- **Required:** ONE "Requirements & support" page under Getting Started
  (never under Reference) containing, as tables with an explicit status
  legend (✅ supported / 🟡 experimental / ⌛ planned / 🚫 not planned):
  - host floors: Claude Code version, Node/bun version, OS — stated as pins
    or as a policy with dates (Turborepo LTS-table style), never as vague
    "recent versions";
  - external-service tiers: which Figma plan/features each design verb needs;
  - the capability matrix: each major surface (TDD gates, design pack,
    graphify, …) × its status per stack/context.
- **Required:** version floors also appear inline at the top of the install
  page (Astro pattern) — one sentence, linking to the matrix page.
- **Required:** every experimental item carries its badge in BOTH the index
  table and its own page's metadata block; graduation removes it in both.
- **Forbidden:** compatibility facts scattered across feature pages with no
  central matrix (the Nx failure). A feature page may restate its own
  requirement, but the matrix page is the source of truth it links to.
- **Forbidden:** documenting a planned/unimplemented capability without its
  ⌛/🟡 status marker — a reader must never discover "not built yet" by trying
  it.

### Guides derive from journeys, not the feature list

- **Required:** the guides tier is an ORDERED journey arc ("from zero to a
  gated pipeline", Turborepo's crafting-your-repository pattern): install →
  init → first gated TDD slice → first plan build → first Figma-to-code
  component → landing a branch. Each page ends with an explicit handoff to
  the next ("What's next" / next-guide link) — a guide page with no next-step
  section is incomplete.
- **Required:** each journey page is one user goal, told in second person,
  high code density (real commands, real output), with tabs only where the
  reader genuinely branches (package manager, stack).
- **Forbidden:** deriving guides by enumerating features ("The Hooks Guide",
  "The Gates Guide") when no user journey starts there. A feature that is
  only ever encountered *inside* a journey is documented inside that journey
  page plus a reference entry — not as its own guide.
- **Forbidden:** a journey page that exceeds one sitting (~2,000 words) —
  split at the seam where the user would naturally stop and verify.

### The entry-point page (first docs page after landing)

- **Required:** the entry page is a HUB, kept deliberately small (Astro/
  Turborepo pattern): one paragraph of what Argo is and the problem it
  solves, the single install command, and 3–4 pathway cards by reader intent
  (start the journey / see the verb reference / check requirements / concepts).
- **Required:** the reader can reach the first successful command within the
  first screen of the first journey page.
- **Forbidden:** the entry page carrying the full mental-model essay,
  changelog, or feature tour — those are links from it, not content on it.

### Workflow visualization

- **Required:** the pipeline (stages, gates, who blocks whom) gets ONE
  canonical diagram on the mental-model/concepts page (Nx pattern), reused —
  by reference, never redrawn per page.
- **Required:** step-by-step flows in guides use numbered Steps components,
  and any "what the user actually sees" moment (a gate blocking, a review
  verdict) is shown as real captured output/screenshot (Playwright pattern),
  not described in prose.
- **Forbidden:** decorative diagrams that restate a step list without adding
  structure (parallelism, branching, feedback loops). If the flow is linear,
  a Steps list IS the diagram.

### Voice and register

- **Required:** second person, imperative, present tense. Terse; one idea per
  sentence. Rationale rides with the instruction ("pin the version — the
  host's lockfile is the source of truth"), Biome-style.
- **Required:** warnings use typed asides (note/tip/caution/danger — the
  Starlight components) and are consequence-first: state what breaks and why,
  in ≤ 2 sentences. Cite the constraint, not the emotion.
- **Forbidden:** hedging ("should probably", "you may want to consider") in
  normative instructions — Argo is opinionated; state the rule and the reason.
- **Forbidden:** marketing superlatives inside guides and reference
  ("blazing-fast", "powerful"). Benefit claims live on the landing/entry hub
  only, and must be concrete.
- **Forbidden:** restating cross-cutting concepts (how gates fire, how config
  resolves) on every page that touches them — write once in the concepts
  cluster, link from a fixed boilerplate line (Tailwind's responsive-section
  pattern).

### Self-check before you finish a docs change

1. Does any new page fail the threshold test (its table row + a reference
   anchor would have sufficed)?
2. Is any requirement/compatibility fact stated somewhere other than (or
   without a link to) the matrix page?
3. Does every touched guide page still end with an explicit next step?
4. Is any reference fact hand-written that exists as metadata?
5. Does any experimental/planned item lack its status badge anywhere it
   appears?

Any "yes" → fix it before reporting done.
