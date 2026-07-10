---
title: Resolve Figma comments
description: Address open Figma review comments as a deliberate pass.
---

A pinned Figma comment is how a reviewer gives spatial, in-context feedback — "this arrow points the wrong way," pinned to the arrow. Argo turns those into fixes explicitly, on request, never as a background sweep.

## Run it

```
/argo:resolve-comments
```

This pulls every unresolved comment thread on the project's Figma file, classifies each by the page its pin sits on (a hi-fi screen or a component master), and applies the fix under that surface's own conventions — a screen fix goes through the screen build's audit gate, a component fix through the component build's.

## Why explicit, not automatic

An earlier design had every session ingest comments at startup. That was wrong for three reasons: it burns tokens polling a file that usually has nothing new, it touches comments nobody asked to be touched in the current session, and it muddies an unrelated build with amendment work that has nothing to do with what's being built. Comment resolution is its own deliberate, invoked task.

## After a fix lands

Each resolved comment gets a reply in-thread so a human can mark it resolved — the skill never resolves a thread itself; the reply is a signal for a human to confirm the fix, not a substitute for that confirmation.

Continue to [hand off a branch](/guides/hand-off-a-branch/) for closing out finished work once fixes are committed.
