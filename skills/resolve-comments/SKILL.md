---
name: resolve-comments
description: Address open Figma comments as an explicit amendment pass — pull the unresolved comment threads on a project's Figma file, classify each by the page its pin sits on (lo-fi wireframe / hi-fi screen / component master), apply the fix under that surface's conventions with the matching audit gate, and post a "✅ Fixed" reply so the human can resolve the thread. Use when the user says "resolve the Figma comments", "address my comments", "pick up the comments on the wireframe", or "/argo:resolve-comments" — a deliberate, invoked task, never an automatic session-start sweep.
---

# resolve-comments

Turns the open comments on a Figma file into fixes. This is an **explicit
amendment task** — you run it when the user asks, not a background sweep every
design session does. Leaving feedback as a pinned Figma comment is how the user
gives spatial, in-context correction ("this arrow points the wrong way", pinned
to the arrow); this skill picks those up, fixes them, and replies in-thread.

Builds on `figma:figma-use` (for any node edit) and dispatches the real fix work
to whichever authoring skill owns the surface — `figma-wireframe`, `figma-create`,
or `figma-audit`. It does not reimplement their rules; it routes to them.

## Why explicit, not session-start (the design decision)

An earlier design had every designer session ingest comments at startup. That's
wrong: it burns tokens polling a file that usually has nothing new, it touches
comments the user didn't ask you to touch, and it muddies an unrelated build
session with amendment work. Comment resolution is its own deliberate,
auditable pass with a clear trigger. Nothing here runs unless invoked.

## The token (hard prerequisite)

Comments live ONLY on the Figma REST API — the Figma MCP and the Plugin API
sandbox have no comment access. So this skill needs a Figma personal access
token with the **`file_comments`** scope, supplied out-of-band:

- `export FIGMA_TOKEN=…` in the environment, **or**
- a gitignored `.argo/figma-token` file at the repo root (one line, the token).

**Never commit the token.** If neither is present, stop and ask the user for it
— do not proceed. The helper script (`scripts/figma-comments.ts`) reads the
token from those two places and nowhere else.

**Running the helper (interim vs. post-migration).** The helper is authored in
TypeScript so it folds into `@argohq/kit` as a typed `argo design comments`
verb once the kit's TS migration lands. Until then it stays here under the
skill (kit-independent, so it can't collide with the migration) and runs via
Node's type stripping:

```
node --experimental-strip-types ${CLAUDE_PLUGIN_ROOT}/skills/resolve-comments/scripts/figma-comments.ts <verb> …
```

After the migration, replace those calls with `argo design comments <verb>` and
delete this script.

## There is no resolve endpoint — the close-out convention

Figma's REST API can read threads and post replies but has **no endpoint to mark
a thread resolved** (an open Figma feature request). So this skill cannot resolve
a comment programmatically. The convention that works around it:

- On fixing a thread, post a reply that **starts with `✅ Fixed`**:
  `✅ Fixed — <what changed>`.
- On a thread you can't action without more information, post a reply that
  **starts with `❓`**, then a **specific question**.
- The **human** clicks resolve on the `✅ Fixed` threads — that stays a human
  action by design (it's their confirmation the fix is right).

**Keep replies terse — one line.** These are notifications the user skims on a
pin, not a changelog. A fix reply is `✅ Fixed — <what changed>` in a single
short clause (name the node/prop only when it disambiguates); no restating the
comment, no rationale, no method narration, no before/after prose. A question is
`❓ <the one specific question>` — the ambiguity and the options, nothing else.
If a fix genuinely needs a caveat (a kit gap, a partial fix, a blast radius),
that's a second short clause, not a paragraph. Rule of thumb: if the reply wraps
past one line in the Figma pin, it's too long.

The close-out gate is therefore **triage-completeness**, not resolution: every
open thread the run saw must end carrying either a `✅ Fixed` reply or a `❓`
question reply. A thread left with neither is an incomplete run.

**The two markers are load-bearing, not decoration.** The token is a personal
access token, so the bot posts replies as the same Figma user who left the
comments — author id cannot distinguish bot from human. `list` therefore
detects thread state by these message-prefix markers, not by author: a thread
with a `✅ Fixed` reply is dropped as **handled** (awaiting the human's resolve
click); a thread whose **last** reply is a `❓` question is dropped as
**awaiting the user**; everything else surfaces for triage. If you post a fix
reply without the `✅ Fixed` prefix, or a question without the `❓` prefix, the
next sweep will re-triage the thread and redo the work. Always prefix.

## Three-way routing — classify by the pin's page, not the file

Wireframes, hi-fi screens, and component masters can all live in one file (in
argo-v2 they're different PAGES of `figma.projectFileKey`: `W##`, `D##`, and
`Custom Components`). So classification is **per comment, by the page its pin
sits on** — not one decision for the whole file. Resolve the pin's `nodeId` to
its page via the Plugin API (`figma.getNodeByIdAsync(nodeId)`, then walk
`.parent` up to the `PAGE`), read the page name, and route:

| Pin's page | Surface | Fix convention (skill that owns it) | Audit |
| --- | --- | --- | --- |
| `W##` (wireframe) | lo-fi wireframe | `figma-wireframe` — grayscale, lo-fi palette, kit instances, ONE typeface, no Semantic bindings | advisory (W pages are tier-0 exempt) |
| `D##` (screen) | hi-fi screen | `figma-create` component-first screen path — composition from instances, bound spacing | **hard** tier-0 on the touched screen node |
| `Custom Components` / `foundations/*` | component master | `figma-create` authoring rules — variant naming (D18), mode copies (D11), Semantic bindings, icons-as-instances | **hard** tier-0 named-component gate on the master |

Component masters are the highest-stakes surface for a reason the other two lack:
**editing a master ripples to every instance across every `D##` screen.** So a
master fix carries two extra obligations beyond a screen fix:

- **Obey component-authoring conventions** (not screen-composition ones) — the
  `figma-create` "Authoring rules" section governs.
- **Blast-radius awareness.** After editing a master, run the hard
  named-component audit on the master, then report which `D##` screens
  instantiate it (and flag any *detached* instances that won't pick up the
  change — e.g. the ProjectHeader instances detached from the kit Accordion).
  Put the blast radius in the `✅ Fixed` reply so the user knows what moved.

**Conservatism on masters.** Apply a clear master fix (with the hard audit +
blast-radius report). But anything touching **variant structure** — adding/
removing a variant, renaming a component property, `combineAsVariants` changes —
is not auto-applied: post a question reply describing the proposed structural
change and let the user confirm before you restructure a master.

## Optional scope argument

Invoked bare, the skill processes every open thread on the file. An argument
narrows it: `wireframe` (only `W##` pins), `design`/`screen` (only `D##`),
`components` (only the component surface), or a page name / node id. Use this
when the user only wants one surface amended.

## Execution shape — analyze in parallel, write serially

Do NOT process threads one-at-a-time end-to-end (classify → fix → audit →
reply, per thread). Do NOT fan out the *writes* either. Split the run into a
parallel read phase and a serial write phase:

1. **Analyze (fan out, read-only).** After `list` returns the open threads,
   dispatch a subagent per thread (or per surface batch) to do the read-only
   work: resolve the pin's page, classify `W##`/`D##`/component, decide
   fix-vs-question, and draft both the concrete edit and the one-line reply.
   Each returns a structured item `{ commentId, nodeId, page, surface,
   decision: 'fix'|'question', editPlan, replyText }`. This is where the
   latency is and it is race-free — nothing writes.
2. **Apply (single writer, serial).** One agent applies the drafted edits in
   this order: `W##` wireframe fixes first (audit-exempt), then `D##` screens,
   then component masters **last and strictly one at a time** (blast radius —
   a master edit ripples to every instance, so two "disjoint" fixes can still
   collide through a shared master). Then run **one** `figma-audit` over all
   touched `D##`/component nodes and record **one** receipt.
3. **Reply (may fan out again).** The `✅ Fixed` / `❓` REST posts are plain
   HTTP with no Figma mutation, so they can go out in parallel at the end.

**Why writes stay serial (non-negotiable).** `use_figma` writes to one live
file, and every write bumps the repo-global `.argo/design-guard.json` counter.
Fanning out writer subagents recreates the concurrent-write deadlock inside a
single run: N agents mutating the same file and counter, none able to record a
clean audit its siblings don't immediately invalidate. The parallelism win is
entirely in the analysis; the write phase is inherently sequential.

## Procedure

1. **Resolve the target file key(s)** from `.claude/argo.json` — the app's
   `design.<app>.figma.projectFileKey` (the file the screens/wireframes/components
   live in). If a project ever configures separate wireframe and design files,
   process each configured key; here it's the one project file with W/D/Custom
   pages.
2. **Confirm the token** (env or `.argo/figma-token`). Missing → stop and ask.
3. **Pull open threads:** run
   `node ${CLAUDE_PLUGIN_ROOT}/skills/resolve-comments/scripts/figma-comments.mjs list <fileKey>`
   from the repo root. It returns `{ me, openThreads }` — root threads that are
   unresolved and not authored by the bot (it filters own replies via `/v1/me`,
   so a re-sweep never re-triages your own `✅ Fixed`/question replies). If a
   scope argument was given, filter `openThreads` to it after classification.
4. **Analyze every thread — fan out, read-only** (see "Execution shape").
   Dispatch a subagent per thread (or per surface batch) to resolve its
   `nodeId` to a page (Plugin API, above), read the page name → `W##` / `D##` /
   component, decide fix-vs-question, and draft the concrete edit + the one-line
   reply. A thread whose `nodeId` is null (a bare canvas-coordinate pin with no
   node) → treat as a file-level note: read the message, route by what it
   references, or ask. Nothing writes in this phase. Collect the drafted items.
5. **Apply the fixes — single writer, serial** (see "Execution shape"),
   ordered `W##` → `D##` → masters (masters one at a time). For each:
   - **Clear and actionable** → apply the fix using the routed convention, then
     reply one terse line (see "Keep replies terse"): `✅ Fixed — <what changed>`
     via the helper's `reply <fileKey> <commentId> <message>`. For a master,
     append the blast radius as a short second clause, not a paragraph.
   - **Ambiguous / underspecified / structural master change** → reply
     `❓ <the one specific question>` (name the exact ambiguity + the options,
     nothing else), and move on without editing.
6. **Re-sweep** (`list` again). Because the helper filters out bot-authored
   comments, the re-sweep shows only threads still needing action — a clean way
   to confirm nothing was missed. Threads you answered with a question stay
   "open" (correctly — they await the user), but now carry your reply.
7. **Audit the writes — once, after the whole write phase.** If any `D##` screen
   or component master was edited, the hard tier-0 gate applies exactly as in
   normal design work: run `figma-audit` named-component mode on the touched
   nodes and **record a fresh `design/audit-receipt.json`**
   (`argo design record-audit-receipt`) at the current guard write count.
   `design-guard-stop.mjs` blocks the session otherwise — comment-driven Figma
   writes are still Figma writes. Wireframe-only (`W##`) edits are audit-exempt,
   so no receipt is required for a run that touched only wireframe pages. (The
   stop gate is per-session since kit 0.2.1, so a concurrent designer editing
   the same file no longer invalidates this run's receipt — but keep the audit
   to the end of the serial write phase regardless.)
8. **Report — the triage-completeness close-out.** Summarize every thread the run
   saw, grouped by surface: fixed (with the fix reply) vs. questioned (with the
   question), plus the audit/receipt result for any hard-gated writes. State
   plainly that resolution is the user's click on the `✅ Fixed` threads — this
   skill fixes and replies, it cannot resolve.

## What this skill does NOT do

- **Does not resolve threads** (no API for it) — posts `✅ Fixed`, user resolves.
- **Does not run on its own** at session start or on any schedule — invoked only.
- **Does not reimplement authoring rules** — it routes to `figma-wireframe` /
  `figma-create` / `figma-audit`, which own the conventions and gates.
- **Does not restructure a component master's variants** without a confirming
  question first.

## Verification

Manual dry-run only — no Figma file lives in this repo. Real verification is a
live run against the argo-v2 project file (`CLEHEoqvJlRti3dCCfOytS`) with a
`file_comments`-scoped token present, processing actual pinned comments.
