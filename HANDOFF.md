# Session handoff — landing page pitch rewrite + docs regeneration

Written 2026-07-10, migrating machines mid-task. Next session continues two
work items. Read this top to bottom before acting.

## Item 1 (active): rewrite the landing page as a PITCH

`apps/docs/src/pages/index.astro` is the live landing page
(https://milad-alizadeh.github.io/argo-plugin/ — custom HTML, bypasses
Starlight; dark-only; base path `/argo-plugin` is load-bearing, use
`import.meta.env.BASE_URL`).

State of play, in order:
1. A first custom page shipped and the owner's verdict was: **too verbose**
   ("the design is a bit better to be fair but not good enough yet").
   Reference bar: turborepo.dev and cline.bot.
2. A content map was drafted cutting ~450 words of body prose to ~65 (every
   section = eyebrow + headline + max one sentence; the artifacts — gate
   rail, blocked-commit terminal, Figma matrix card, playbook ledger,
   install terminal — do the explaining). Artifact:
   https://claude.ai/code/artifact/266e6878-42f2-49f7-8c08-3725587c8ae2
3. Hero subtitle chosen by the owner (babysitting framing, shortened):
   **"Stop babysitting your AI. Argo makes Claude Code prove its work
   before anything merges."**
4. THEN the owner escalated: "the entire page needs to be a pitch. I want
   you to actually do another online research on how to write proper
   content for this." So the content map above is now INPUT, not the spec —
   the next session must first research how strong dev-tool marketing copy
   is actually written (positioning, pitch structure, headline/subhead
   craft — think April Dunford-style positioning, landing-page copywriting
   frameworks like PAS/jobs-to-be-done, plus tearing down how
   turborepo.dev, cline.bot, linear.app, warp.dev word their pitches
   line by line), and only then rewrite the page copy as a coherent pitch:
   problem → stakes → what Argo is → proof → CTA. The visuals/structure
   from the map largely survive; the words must sell to someone who has
   never heard of Argo.

Hard constraints (all learned the expensive way this session):
- Ground every claim in `.argo/design/docs-facts.md` (committed facts
  inventory: shadcn-tailwind is the ONLY recipe; Figma **Professional+**
  required, one-mode variable cap below it; probity needs subscription
  auth; six design playbooks; NEVER mention the Argo cockpit app).
- No em dashes / forbidden words in page copy (`bun run lint:docs-style`
  in apps/docs; list in `templates/rules/documentation-style.md`).
- Verify by ACTUALLY LOOKING: build, serve dist under a simulated
  `/argo-plugin/` subpath, drive a real browser, screenshot; after landing,
  check the live URL. A grep of built HTML is not verification
  (`.claude/rules/testing.md` now encodes this).
- `bun run build` in apps/docs runs generate-reference + astro check +
  build + an empty-page guard; all must pass. Toolkit must be built first
  (`cd packages/toolkit && bun run build`) in a fresh worktree.
- Work in a worktree; NEVER switch/reset the primary checkout (parallel
  sessions share it — this session corrupted state twice before the rule
  was added to `skills/build-plan/SKILL.md`).
- Landing mode is `merge`: rebase worktree branch onto origin/main, push
  `HEAD:main`. origin/main moves fast (parallel sessions) — fetch right
  before pushing.

## Item 2 (queued): regenerate the docs site through the new process

Everything needed is committed:
- `.argo/design/docs-facts.md` — the grounded facts inventory (with ten
  enumerated corrections to current docs at the bottom).
- `.argo/design/docs-content-strategy-research.md` — six-product docs
  research + checkable strategy rules.
- `templates/rules/documentation-content.md` — the binding rule (two-tier
  IA, page-vs-table threshold, requirements matrix, journey guides).

The work: kill the 32 per-skill/per-agent frontmatter-blurb pages in favor
of index tables (that's a `apps/docs/scripts/generate-reference.mjs`
change); playbook diagrams lead the reference section (diagrams already
render left-to-right and CI now installs Playwright Chromium so they render
in deploys); add a "Requirements & support" page under Getting Started
(facts inventory §2 has everything, incl. the Figma plan matrix); rewrite
guides as an ordered journey arc; scrub the one cockpit mention
(`what-is-argo.md:17`); apply the ten corrections. Update
`.argo/docs-manifest.json` hashes for regenerated prose pages
(`apps/docs/scripts/docs-manifest.mjs` is the API).

## Loose ends

- Stale superseded worktree: `.claude/worktrees/agent-a45757323d58997f2`
  (+ branch `worktree-agent-a45757323d58997f2`) — safe to delete, guard
  blocks agents from doing it: `git worktree remove --force <path> &&
  git branch -D <branch>`.
- Local branch `worktree-docs-system-build` (merged long ago) also
  deletable.
- `.argo/plans/docs-system.md` + progress doc describe the ORIGINAL docs
  build (already landed via PR #5); the regeneration in Item 2 supersedes
  parts of it — don't re-run that plan.
- This HANDOFF.md should be deleted once both items land.

## Suggested skills / agents

- `deep-research` or `argo:research` — the marketing-copy research (Item 1
  step 1).
- `frontend-design:frontend-design` — load before touching page markup.
- `argo:reviewer` — review the branch before landing either item.
- `/argo:docs-refresh` exists but is NOT the tool for Item 2 (it refreshes
  human-edited pages; Item 2 is a structural regeneration).
