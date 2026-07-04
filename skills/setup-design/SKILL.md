---
name: setup-design
description: Install/adapt the Figma-to-code design pack into a host project — shadcn init, Storybook + Vitest addon, VRT/spec-diff walkers, gate wiring, lint rule, design/config.json, figma-design-kit path dependency. Use when the user says "set up design", "install the design pack", "wire up Figma-to-code", or when setup-claude's recommendations pass mentions it.
---

# Set Up the Design Pack

Installs/adapts the whole Figma-to-code design pack, mirroring `setup-claude`'s
wizard shape: AskUserQuestion batches, propose-don't-impose, per-item consent.
See `skills/setup-design/templates-reference.md` for the exact `{{…}}` slot ↔
`design/config.json` field mapping for every template this skill copies.

## 0. Wizard UX

Same rules as `setup-claude` §0: batch related decisions into one
AskUserQuestion call (up to 4 per screen), recommended option first and
labeled, free-form via "Other", prose only for the opening one-liner and the
final report.

## 0a. Are you using Figma?

AskUserQuestion, single question: "Does this project use Figma as its design
source of truth?" If no: **stop** — explain in one paragraph that this pack
is a Figma-to-code pipeline (tier-0 hygiene audit, spec-diff/VRT gates, kit
sync) and doesn't apply without Figma. Never force Figma onto a project that
doesn't use it.

## 0b. Professional plan or higher?

AskUserQuestion, single question: "Is this Figma file on a Professional plan
or higher?" **Why this gate exists (F10):** below Professional, variable
collections are capped at **one mode**, which blocks the Light+Dark Semantic
collection this pack's D10/D11 rules depend on — so this gate applies to
**every** recipe, not just `external-library`; `external-library` additionally
needs library publishing (a separate Professional-plan-gated feature). Do
**not** cite the Variables REST API as a workaround — the pipeline explicitly
rejected it as Enterprise-gated; nothing in this pack depends on it. If no:
**stop** with the same clear-explanation pattern as §0a — this is a hard
prerequisite, checked early (D23).

## 0c. Recipe selection

AskUserQuestion: which recipe to install. Today there is exactly one option,
`shadcn-tailwind-external-kit` (label it recommended/only choice, per this
skill's existing "recommended option first and labeled" convention below).
Store the choice into `design/config.json`'s new `recipe` field. Each recipe
supplies named extension points that skills dispatch to, resolving to files
installed from `templates/design/recipes/<name>/`:

- **recipe audit checks** — `design-source/tier0-recipe-checks.js`, spliced
  into `tier0-audit.js`'s injection region (Slice 2's F12 assembly)
- **recipe sync steps** — `design-source/kit.lock.example.json`/
  `kit-patches.example.json` (external-library-only), consumed by
  `figma-sync`
- **Semantic seeding** — the recipe's `README.md` states its
  `baseSource`/`codeTarget`, which downstream skills branch on
- **token writer** — `code-target/token-writer.md`, consumed by
  `figma-sync` step 7
- **upgrade flow** — `design-upgrade`'s guard clause reads `recipe`'s
  `baseSource` to decide whether the paired-upgrade flow applies at all

## 1. Detect the stack

Confirm (or ask if undetectable): UI framework, components dir, existing
Storybook install (version, builder), existing Vitest install, package
manager, whether `shadcn` is already initialized (a `components.json` at
root is the tell). This mirrors `setup-claude` §2 — reuse its detection if
this project already ran that skill.

## 2. shadcn init via the shadcn MCP (D16) — default-on where possible

Mirrors the tdd-guard default-on pattern (`skills/setup-claude/SKILL.md`
§6c: detect → install default-on with a stated skip path, never silently
required):

- Detect whether the shadcn MCP can be installed (CLI 3.0+, per the design
  doc). **Confirm the live install/registration command against current
  shadcn docs before running it** — do not invent flags (anti-spiral: this
  mirrors `skills/scaffold/SKILL.md`'s own "always confirm the current
  command against docs" rule, and the design-pack plan flags this exact gap
  as unverified, see plan §6 risk 4).
- Supported → install default-on, run `shadcn init` (CSS vars as a one-time
  seed, D19 — the generated `@theme` region supersedes them on first
  `figma-sync`, one writer thereafter).
- Unsupported → print `shadcn MCP unavailable — skipping shadcn init` and
  move on. Never install an inert fallback.
- `--no-shadcn` (or the user saying so) skips this step.

## 3. Storybook + Vitest addon — latest, triad recorded observed-good

Install the **latest** Storybook (Vite builder) and its Vitest addon —
**never hardcode a version** in this skill's own text (design doc D9/C20:
"known-good triad, not hardcoded" vs the task's own latest-tools policy).
After install, record the ACTUAL resulting versions
(`storybook`/`vitestAddon`/`vitest`) into `design/config.json`'s
`knownGoodTriad` — this is a recorded observation of what worked, not a
pinned recommendation. If a later bump on this host project breaks the
triad, that's a `design-upgrade`-style gated bump in the HOST project, not a
plugin-repo change (this skill does not build upgrade detection, see plan
§6 risk 2).

## 4. Copy and fill design-pack templates

Copy from `${CLAUDE_PLUGIN_ROOT}/templates/design/` into the host project,
filling every `{{…}}` slot per `skills/setup-design/templates-reference.md`:
`vrt-walker/`, `spec-diff-walker/spec-diff.walker.spec-diff.js`,
`gate-wiring.md`, `config.example.json` → `design/config.json` — always.
Then assemble `tier0-audit.js` (into `design/`, so
`figma-audit`/`figma-sync`/`figma-create` read the project's own assembled
copy rather than the plugin template): splice the chosen recipe's
`design-source/tier0-recipe-checks.js` into the mechanism script's marked
injection region (F12/X3 — ONE canonical script, never two). Install the
chosen recipe's remaining templates per their `templates-reference.md`
install-when conditions: `design-source/base-congruence.walker.spec-diff.js`
+ `kit-patches.example.json` + `kit.lock.example.json` (only when the
recipe's `baseSource == "external-library"`), `code-target/lint/design-lint.md`
(only when a lint config and a components dir already exist), and
`code-target/token-writer.md` (always, for whichever recipe is chosen). Ask
where each walker directory should live (offer a sane default, e.g.
`test/vrt/`, `test/spec-diff/`) if the host project has no obvious
convention.

## 5. Add path dependencies

Mirrors `skills/setup-claude/SKILL.md` §6c's tdd-guard-playwright
instructions verbatim: add `figma-design-kit` to the host project's manifest
as a path dependency pointing at
`${CLAUDE_PLUGIN_ROOT}/packages/figma-design-kit` (published later if ever —
same lifecycle note as `tdd-guard-playwright`). Additionally add
`figma-design-kit-shadcn-tailwind` as a path dependency when the chosen
recipe (§0c) is `shadcn-tailwind-external-kit` — its `tier0-recipe-checks.js`
imports from it.

## 6. Append the testing.md amendment — with consent

If the host project has a `.claude/rules/testing.md` (installed by
`setup-claude`), show the diff and ask before appending
`templates/design/testing-rule-amendment.md`'s C17 scoped-exception text —
**never silently edit a file `setup-claude` already installed.** If no
`testing.md` exists yet, offer to run `setup-claude` first, or install the
amendment as a standalone note the user can fold in manually.

## 7. Create `design/` scaffolding

Create the `design/` dir with an empty `waivers.json` → `[]` placeholder
always. Only when the chosen recipe's `baseSource == "external-library"`:
also create `kit-patches.json` (copied from the recipe's
`design-source/kit-patches.example.json`, `{}`) — leave `kit.lock` for
`figma-sync`'s first sync to populate (per `templates-reference.md`'s
`kit.lock.example.json` row). For any other `baseSource`, there is no kit
copy to track edits against — skip both files entirely. Leave `tokens.json`,
`specs/`, `screenshots/`, `story-map.json` for `figma-sync` to populate on
first sync regardless of recipe.

## 8. Offer a smoke check

After install, offer to run `/argo:figma-audit` as a smoke check (it depends
on Slice 11 already existing) — never run it silently; the user may not
have a Figma file connected yet.

## 9. Report

List exactly what was written/installed where (mirrors `setup-claude` §9):
shadcn init result, Storybook/Vitest versions recorded, every template
copied + its fill values, the path dependency added, whether the testing.md
amendment landed, and the `design/` scaffolding created. Verified by manual
dry-run against a scratch project only — no host project lives in this repo
to install into for real.
