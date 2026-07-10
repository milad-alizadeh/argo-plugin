---
name: resolve-comments
description: Address open Figma comments as an explicit amendment pass — pull the unresolved comment threads on a project's Figma file, classify each by the page its pin sits on (hi-fi screen / component master), apply the fix under that surface's conventions with the matching audit gate, and post a "✅ Fixed" reply so the human can resolve the thread. Use when the user says "resolve the Figma comments", "address my comments", or "/argo:resolve-comments" — a deliberate, invoked task, never an automatic session-start sweep.
---

<!-- INCLUDE: packages/toolkit/packs/design/craft/resolve-comments.md -->
# resolve-comments — judgment for turning pinned feedback into fixes

Turns open comments on a Figma file into fixes. This is a deliberate,
invoked task, never a background sweep — leaving feedback as a pinned Figma
comment is how a human gives spatial, in-context correction ("this arrow
points the wrong way", pinned to the arrow); this work picks those up, fixes
them, and replies in-thread.

## Why explicit, not session-start (the design decision)

An earlier design had every session ingest comments at startup. That's
wrong: it burns tokens polling a file that usually has nothing new, it
touches comments nobody asked to be touched, and it muddies an unrelated
build session with amendment work. Comment resolution is its own deliberate,
auditable pass with a clear trigger.

## There is no resolve endpoint — the close-out convention

Figma's comment API can read threads and post replies but has no endpoint to
mark a thread resolved. The convention that works around it:

- On fixing a thread, post a reply that **starts with `✅ Fixed`**:
  `✅ Fixed — <what changed>`.
- On a thread that can't be actioned without more information, post a reply
  that **starts with `❓`**, then a specific question.
- The human clicks resolve on the `✅ Fixed` threads — that stays a human
  action by design (it's their confirmation the fix is right).

**Keep replies terse — one line.** These are notifications a human skims on
a pin, not a changelog. A fix reply is `✅ Fixed — <what changed>` in a
single short clause (name the node/prop only when it disambiguates); no
restating the comment, no rationale, no before/after prose. A question is
`❓ <the one specific question>` — the ambiguity and the options, nothing
else. If a fix genuinely needs a caveat (a gap, a partial fix, a blast
radius), that's a second short clause, not a paragraph. Rule of thumb: if the
reply wraps past one line in the Figma pin, it's too long.

The close-out bar is therefore triage-completeness, not resolution: every
open thread a run saw should end carrying either a `✅ Fixed` reply or a `❓`
question reply. A thread left with neither is an incomplete run.

The two reply-prefix markers are load-bearing, not decoration: a personal
access token posts as the same Figma user who left the comments, so author
id can't distinguish bot from human — thread state has to be read from these
message prefixes instead. Always prefix, or a re-sweep will re-triage a
thread and redo the work.

## Two-way routing — classify by the pin's page, not the file

Hi-fi screens and component masters can live in one file as different pages.
So classification is per comment, by the page its pin sits on:

| Pin's page | Surface | Fix convention | Audit |
| --- | --- | --- | --- |
| a screen page | hi-fi screen | composition from instances, bound spacing | hard hygiene check on the touched screen node |
| the components page / foundations | component master | authoring conventions — variant naming, semantic bindings, icons-as-instances | hard hygiene check on the master |

Any other page falls through to unmatched: post a `❓`, never guess a
surface.

Component masters are the highest-stakes surface for a reason the other
surfaces lack: **editing a master ripples to every instance across every
screen.** So a master fix carries two extra obligations beyond a screen fix:

- Obey component-authoring conventions, not screen-composition ones.
- Blast-radius awareness — after editing a master, report which screens
  instantiate it (and flag any *detached* instances that won't pick up the
  change). Put the blast radius in the fix reply so the human knows what
  moved.

**Conservatism on masters.** Apply a clear master fix (with the hard check +
blast-radius report). But anything touching the **variant structure** of an
existing master — adding/removing a variant, renaming a component property,
restructuring the variant set — is not auto-applied: post a question
describing the proposed structural change and let the human confirm before
restructuring a master. (Creating a *new* component is not this — see
below.)

## Componentization requests — "this should be a component"

A frequent comment is not a fix *to* a node but a request to turn a node into
a component: "this should be a component", "componentize this", "extract as
a reusable component". These are **actionable fixes — do them.** Never a
silent drop, and don't reflexively defer them to a question. The human is
manually flagging under-decomposition — the same thing an advisory
composite-naming check catches: a plain frame sitting where a built
component belongs.

1. Create the component master from the flagged node (or the smallest
   subtree the comment scopes) under the normal authoring conventions, and
   register it.
2. Replace the original with an instance of the new master, so the screen
   is composed from it rather than tracing it. If the comment implies
   several occurrences, swap the ones the human pointed at and name any left
   in the reply.
3. Run the hard authoring check on the new master — this is authoring, so
   the hard gate applies.
4. Reply `✅ Fixed — extracted <NodeName> into component "<Component>"
   (registered, N instance(s) swapped)`, plus blast radius if it now
   ripples.

**This is creation, not restructuring, so it is applied, not deferred.** The
conservatism rule above defers changes to an *existing* master's variants;
minting a *new* component from a frame is additive and is the entire point
of a design system. Fall back to a `❓` only when the request is genuinely
ambiguous — the component boundary is unclear (which subtree?), or no name
is given or obvious. Even then, post the `❓`; never drop the thread.

## Batch the read, reason once, write serially, reply as you go

Don't fan out per-thread analysis to separate parallel workers — comments
cluster heavily on a small number of screens, so the parallelism ceiling is
low and the cold-start cost of each worker dominates. Batch every thread's
context resolution into one read, reason over all of it in a single inline
pass, then write fixes serially (screens first, masters last and strictly
one at a time — a master edit ripples to every instance, so two "disjoint"
fixes can still collide through a shared master). Reply to each comment the
moment its fix lands, not batched to the end — a run that dies partway
through must still leave every thread it already fixed carrying its reply,
not silently un-replied because a final batch-post step never ran.

## What this skill does NOT do

- Does not resolve threads (no API for it) — posts `✅ Fixed`, the human
  resolves.
- Does not run on its own at session start or on any schedule — invoked
  only.
- Does not reimplement authoring or hygiene conventions — it routes to
  whichever surface owns them.
- Does not restructure a component master's variants without a confirming
  question first.

## Verification

No Figma file lives in this repo — real verification is a live run against
a host project's Figma file with a comment-scoped token present, processing
actual pinned comments.
<!-- /INCLUDE -->
