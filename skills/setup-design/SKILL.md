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
`vrt-walker/`, `spec-diff-walker/`, `gate-wiring.md`, `lint/design-lint.md`,
`config.example.json` → `design/config.json`. Ask where each walker
directory should live (offer a sane default, e.g. `test/vrt/`,
`test/spec-diff/`) if the host project has no obvious convention.

## 5. Add `figma-design-kit` as a path dependency

Mirrors `skills/setup-claude/SKILL.md` §6c's tdd-guard-playwright
instructions verbatim: add it to the host project's manifest as a path
dependency pointing at `${CLAUDE_PLUGIN_ROOT}/packages/figma-design-kit`
(published later if ever — same lifecycle note as `tdd-guard-playwright`).

## 6. Append the testing.md amendment — with consent

If the host project has a `.claude/rules/testing.md` (installed by
`setup-claude`), show the diff and ask before appending
`templates/design/testing-rule-amendment.md`'s C17 scoped-exception text —
**never silently edit a file `setup-claude` already installed.** If no
`testing.md` exists yet, offer to run `setup-claude` first, or install the
amendment as a standalone note the user can fold in manually.

## 7. Create `design/` scaffolding

Create the `design/` dir with empty placeholders: `waivers.json` → `[]`,
`kit-patches.json` → `{}`. Leave `tokens.json`, `specs/`, `screenshots/`,
`story-map.json`, `kit.lock` for `figma-sync` to populate on first sync —
this skill only creates the empty, schema-agnostic placeholders.

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
