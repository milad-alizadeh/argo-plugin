# Design: human-facing docs, generated but not AI-sounding

Status: agreed via grill-me, ready for planner
Scope: argo-plugin's own docs site + the docs opt-in that `/argo:init` installs
into consuming apps.

## Problem

Two gaps:

1. **The plugin has no human-facing docs site.** README.md + PIPELINE.md carry
   the pipeline diagrams and prose, but there's no navigable site for a user
   adopting argo on their own project. The audience is *users* of the argo way
   of working, not contributors to the plugin.
2. **Consuming apps have no docs story, and AI-driven builds let docs drift.**
   Implementation moves, docs don't. We want docs that stay current at near-zero
   marginal cost, and that don't read as machine-generated.

The whole design answers four questions settled earlier — when to document (at
the landing gate, same change as the code), where (in-repo, under version
control), how (generated then owned), what (Diátaxis, public contract only).

## Chosen approach

### 1. Two separate sites, cross-linked — never consolidated

- `apps/docs` (Astro + Starlight) inside **argo-plugin** — docs for the argo way
  of working, usable by any Claude Code project.
- `apps/docs` inside **argo-v2** already exists — docs for the desktop cockpit.
- They stay separate: different products, different audiences, different release
  cadences (plugin docs track `claude plugin update argo@argo`; app docs track
  app releases). The dependency is one-directional and thin — argo-v2 *uses* the
  plugin, so its docs **link out** to the plugin site for any argo concept rather
  than re-explaining it.
- Any future unified brand is a **domain-level** concern (e.g. `docs.argo.dev`),
  not a merged build. Cheap to add later; un-merging a consolidated site is not.

Deployment: GitHub Pages via a CI workflow on push to `main`. Copy the proven
argo-v2 Starlight setup — `rehype-mermaid` (build-time SVG, no client JS),
`check-links` crawl of the built site.

### 1b. Marketing landing page — the Starlight splash home

The site root `/` is an edgy marketing landing page built as a Starlight
`template: splash` home; docs live under the guide nav. One Astro build, one
Pages deploy, one shared theme — the landing page and docs cannot drift apart.

- **Hero line:** *"Claude Code, batteries included."* Subhead frames the loop and
  the trust angle (PRD to shipped code, with the gates that make autonomous
  builds trustworthy). Alternate taglines available as secondary copy.
- **Feature blocks (the "batteries") — 4:**
  1. **The canonical loop** — PRD → grill → plan → test-first build → review →
     land, each a dedicated agent/skill.
  2. **Gates that make it trustworthy** — probity red-first TDD, receipt-based
     commit gates, deterministic design-rules audits.
  3. **Figma-to-code, both directions** — design system as source of truth,
     spec-diff / gestalt acceptance gates.
  4. **Works with any Claude Code project** — project-scoped install, adapts to
     your stack via init, no lock-in.
- **CTAs in the hero:** primary "Get started" → docs tutorial; secondary
  "GitHub" → repo.
- **Aesthetic:** edgy, dark-theme only, matching the argo-v2 cockpit. Build the
  hero with the **frontend-design** skill for a distinctive, non-templated look.

### 1c. Theme — mirror argo-v2's tokens, dark only

The landing page and docs use the argo-v2 palette (slate `#151c2b`, graphite
panels, cloud/mist/steel blues, green/amber status accents). Dark-theme only,
no light/dark toggle.

argo-v2 is a **separate, private** repo — no package dependency, no runtime
coupling. Tokens are mirrored by an **on-device sync script** (the
graphify-refresh pattern): single writer, on-device, uses existing `gh`/git
auth to pull `base.css` from `milad-alizadeh/argo-v2`, extracts the `@theme`
block, writes a committed generated file
(`apps/docs/src/styles/argo-theme.generated.css`) with a "generated — do not
edit" header. Run manually when the theme changes; the committed file is the
build's source of truth, so the site always builds offline. Rejected: CI-fetch
(needs a cross-repo PAT secret + couples the build to a private repo staying
reachable) and a shared token package (couples two deliberately independent
repos). The only coupling is the script knowing argo-v2's file path — it fails
loudly if that moves, rather than drifting silently.

### 2. Diátaxis, weighted for users

Four buckets, but the weight lands where a *user* needs it:

- **Tutorials** (hand-shaped, high value): get argo running on a real project,
  first gated build end to end.
- **Explanation** (hand-shaped, high value): the pipeline, the gates, the trust
  model — the "why it's built this way".
- **How-to guides** (hand-shaped): task recipes — set up design, resolve Figma
  comments, hand off a branch.
- **Reference** (generated — see §3): one page per skill / agent / playbook /
  CLI command / config field.

Contributor docs (how the plugin itself is built) stay as repo markdown, **off
the site**.

### 3. Everything is generated, then owned

The whole site is generated at setup — including the prose — then the pages
become ordinary committed markdown that humans and the integrator maintain. Two
distinct generation classes:

- **Mechanical reference — build-time generated, never hand-edited.** Rendered
  on every docs build from the real sources of truth, so it can't drift:
  - Playbook pages + diagrams via the existing `argo playbook diagram <name>`
    (renders mermaid from each playbook spec in the registry — SSOT, already
    shipped in @argohq/toolkit).
  - Skill / agent pages from `SKILL.md` frontmatter (name, description, triggers)
    and agent definitions.
  - CLI command reference and `.argo/config.json` schema.
  A new skill/agent/playbook automatically gets a page — add-by-adding, no docs
  edit needed. These live in injected regions or standalone generated pages.

- **Prose — generated once at setup, owned thereafter.** Tutorials, how-tos, and
  explanations are AI-authored at setup under the style rule (§4), then edited
  freely by humans and kept current by the integrator's same-PR doc-sync — NOT
  by re-running the generator. This is the figma-sync "generated region vs owned
  file" pattern applied to docs.

### 4. It must not read as AI-generated — a checkable style rule

New standing rule `templates/rules/documentation-style.md` (installed into a
project's `.claude/rules/` by init, and governing the plugin's own docs):

- Adopt **Google developer documentation style guide** conventions: second
  person, present tense, active voice, short varied sentences, conversational
  but not cute, no reflexive "please", lead with the point.
- **Forbidden-list** (pattern-matchable, the way the engineering-principles rule
  is written) — the AI tells: em dashes (already a project rule), "delve",
  "seamless", "robust", "leverage", "ever-evolving", "it's important to note",
  "in today's world", uniform bullet-and-heading structure where prose is
  clearer, restating the question, overexplaining before the point.
- **Mechanical backstop:** a Vale style (or a simple word-list lint) in docs CI
  catches the banned vocabulary — aspiration made checkable.

### 5. Ownership tracking — hash manifest, prompt-not-force

`.argo/docs-manifest.json` maps each generated prose page → the hash of its last
generated content. On a doc-sync / regenerate pass:

- **hash matches** → page is still AI-owned → update freely, re-record hash.
- **hash differs** → a human edited it → **prompt** "refresh this page with AI?".
  - yes → update, re-record hash.
  - no → leave it, mark human-owned so it stops prompting.
- **manifest missing/deleted** → treat everything as human-owned (safe default:
  never clobber).

Hash beats a `owner:` frontmatter flag: invisible to the reader, can't be
forgotten, degrades safely.

### 6. The init opt-in for consuming apps

`/argo:init` handles docs as one step:

- **Detect first.** If docs already exist (a docs site or a `docs/` tree), offer
  **keep-up-to-date mode** — wire the manifest + doc-sync against what's there,
  don't scaffold over it.
- **Otherwise ask once:** human-facing docs → **Starlight site** / **plain
  markdown** / **none**.
  - Starlight → scaffold via the canonical generator into `apps/docs`
    (monorepo) or `docs/` (single package).
  - Markdown → seed a `docs/` tree with the four Diátaxis buckets so structure
    exists from day one.
  - None → recorded explicitly, so later stages skip silently instead of nagging.
- **Record the choice** in `.argo/config.json`:
  `"docs": { "mode": "starlight" | "markdown" | "none", "path": "apps/docs" }` —
  the single machine-readable pointer every later stage reads.
- **Consuming-app docs cover that app only.** argo concepts never get copied in;
  init drops a **"Working with argo"** pointer stub linking to the plugin docs
  site so users can find the reference from inside their own docs.
- **Agent-facing docs (CLAUDE.md, rules) are a separate per-project concern** —
  not part of this human-docs opt-in.

## Rejected alternatives

- **One consolidated Astro site for plugin + argo-v2.** Rejected: couples two
  products with different audiences and release cadences; forces cross-repo CI
  and docs PRs landing away from the code they describe (the drift we're
  fighting). A cross-link is the consolidation we actually want.
- **Hand-authored reference pages.** Rejected: reintroduces drift; a new skill
  would silently have no page. Generation makes it add-by-adding.
- **Fully regenerable docs, edits forbidden.** Rejected: contradicts "users can
  update it themselves."
- **Regenerate-with-3-way-merge.** Rejected: most machinery for least benefit;
  the hash + prompt gets the same safety far simpler.
- **`owner:` frontmatter flag for edit tracking.** Rejected: visible reader
  noise, and the editor must remember to flip it. Hash is automatic.
- **A "sound human" generation prompt.** Rejected as the primary lever: not
  checkable. A named style standard + forbidden-list + CI lint is enforceable.

## Open risks / to resolve in planning

- **`argo playbook diagram` coverage.** Only playbook-class skills have specs in
  the registry. Non-playbook skills (grill-me, session-handoff, etc.) render
  from frontmatter only — confirm every skill maps to *some* generated page.
- **Vale in CI.** Vale is a Go binary — decide install path (CI-only vs local
  dev), or start with a lightweight JS word-list lint and add Vale later.
- **Doc-sync ownership.** The integrator already claims "sync docs to what
  landed" — this design makes it read the manifest and do the prompt/auto split.
  Confirm the prompt is viable in the integrator's (often hands-off) context, or
  whether hands-off runs auto-update AI-owned pages only and defer edited ones.
- **Diátaxis seed content depth.** How much prose the setup generator writes on
  day one vs stubs — affects first-run cost.
