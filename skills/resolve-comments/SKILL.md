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

## Execution shape — one batched read, one inline pass, serial writes

Do NOT process threads one-at-a-time end-to-end (classify → fix → audit →
reply, per thread). And do **not** fan out subagents to analyze — an earlier
design did, and it was the slow shape you saw: each subagent paid a `figma-use`
cold start and made its own `use_figma` round trip just to resolve one pin's
page. Once that read is batched (below), the residual analysis is pure reasoning
over data already in hand — the cheap phase — while the expensive phase (Figma
writes) is serial by hard constraint. Fanning out the cheap phase to funnel into
a serial one buys nothing: its ceiling is one subagent per surface (≈3×) and it
collapses toward 1× because comments cluster on `D##` screens. So: batch the
read, analyze in a single inline pass, write serially.

1. **Resolve context — ONE batched, read-only `use_figma` call.** Collect every
   non-null `nodeId` from `list` and run the canned resolver
   (`scripts/resolve-context.js`) over all of them in a single call: prepend one
   line defining the input (`const NODE_IDS = [ …ids… ]`) and pass the script
   body **verbatim** — do not hand-author the resolution loop each run. It
   returns `{ [nodeId]: { page, surface, nodeName, nodeType } }`, or
   `{ [nodeId]: { error } }` per id, with three properties that matter:
   - **Per-id isolation** — each id resolves in its own try/catch, so a pin on a
     since-deleted or reworked node (the common case: feedback outlives the node)
     degrades to `{ error }` for that one thread instead of failing the batch.
   - **Deterministic surface classification baked in** — page name →
     `wireframe` / `screen` / `master` / `file-note` / `unmatched` via the
     routing table, so no model cycles and no subagent spent on a lookup.
   - **Read-only, non-disruptive** — `getNodeByIdAsync` + a `.parent` walk only,
     never `setCurrentPageAsync` (which would bump the design-guard write counter
     and move the current page under a human viewing the live file). Works
     whether or not the file is in dynamic-page mode.
   Threads that come back `unmatched` (a page the table doesn't cover) or
   `error` → treat as ambiguous: post a `❓`, never guess a surface. `file-note`
   / null-`nodeId` pins → file-level notes (route by message, or ask).
2. **Decide + draft — inline, single pass, always.** With page/surface/context
   in hand, decide fix-vs-question and draft the concrete edit + the one-line
   reply for every thread in **one** pass. No threshold, no subagent — this is
   the only reasoning in the run and it is cheap now. If drafting a *precise*
   edit for the fix-decisions needs live node detail (current fills, children,
   variant structure), gather it in **one more** batched read-only `use_figma`
   call over just that fix-subset — never a round trip per thread. Each item is
   `{ commentId, nodeId, page, surface, decision: 'fix'|'question', editPlan,
   replyText }`. Nothing writes in this phase.
3. **Apply — single writer, serial.** Apply the drafted edits in this order:
   `W##` wireframe fixes first (audit-exempt), then `D##` screens, then component
   masters **last and strictly one at a time** (blast radius — a master edit
   ripples to every instance, so two "disjoint" fixes can still collide through a
   shared master; a single inline draft pass also keeps every master thread
   visible to one reasoner, so no two conflicting master plans get drafted).
   Then run **one** `figma-audit` over all touched `D##`/component nodes and
   record **one** receipt.
4. **Reply — parallel REST.** The `✅ Fixed` / `❓` posts are plain HTTP with no
   Figma mutation, so fire them concurrently at the end. (Folding these into a
   single `reply-batch` kit verb that posts in one process and returns a receipt
   is the intended home once `figma-comments.ts` migrates into `@argohq/kit`.)

**Why writes stay serial (non-negotiable).** `use_figma` writes to one live
file, and every write bumps the repo-global `.argo/design-guard.json` counter.
Fanning out writer subagents recreates the concurrent-write deadlock inside a
single run: N agents mutating the same file and counter, none able to record a
clean audit its siblings don't immediately invalidate. The write phase is
inherently sequential; the only concurrency worth having is inside the read
(one batched call) and the reply posts.

## Procedure

1. **Resolve the target file key(s)** from `.claude/argo.json` — the app's
   `design.<app>.figma.projectFileKey` (the file the screens/wireframes/components
   live in). If a project ever configures separate wireframe and design files,
   process each configured key; here it's the one project file with W/D/Custom
   pages.
2. **Confirm the token** (env or `.argo/figma-token`). Missing → stop and ask.
3. **Pull open threads:** run
   `node ${CLAUDE_PLUGIN_ROOT}/skills/resolve-comments/scripts/figma-comments.ts list <fileKey>`
   from the repo root. It returns `{ me, openThreads }` — root threads that are
   unresolved and not authored by the bot (it filters own replies via `/v1/me`,
   so a re-sweep never re-triages your own `✅ Fixed`/question replies). If a
   scope argument was given, filter `openThreads` to it after classification.
4. **Resolve context, then decide + draft** (see "Execution shape"). First run
   **one** batched, read-only `use_figma` call over every non-null `nodeId`
   using the canned resolver `scripts/resolve-context.js` (prepend
   `const NODE_IDS = [ …ids… ]`, pass the body verbatim). It returns
   `{ [nodeId]: { page, surface, nodeName, nodeType } | { error } }` per id —
   per-id isolated, surface classified from the page name, never switching the
   current page. Then decide fix-vs-question and draft the concrete edit +
   one-line reply for every thread **inline, in a single pass** — no subagent,
   no threshold. If a precise edit needs live node detail, gather it in one more
   batched read-only call over just the fix-subset. Threads resolving to
   `unmatched`/`error` (unknown page, missing node) or a null `nodeId` (bare
   canvas pin) → treat as ambiguous/file-level: post a `❓` or route by the
   message, never guess a surface. Nothing writes in this phase. Collect the
   drafted items `{ commentId, nodeId, page, surface, decision, editPlan,
   replyText }`.
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
