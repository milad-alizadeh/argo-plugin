---
name: session-handoff
description: Compact the current conversation into a handoff document so a fresh agent can continue the work. Use when context is running long, when switching tasks, or when the user asks to hand off / write a handoff doc.
argument-hint: "What will the next session focus on?"
---

# Session Handoff

Write a handoff document summarising the current conversation so a fresh agent
can continue. Save it to the **OS temp directory** (`$TMPDIR`), not the
workspace — it's scratch, not a committed artifact.

- Include a **"suggested skills"** section naming the skills the next agent
  should invoke (e.g. `root-cause`, `test-first`, `grill-me`).
- **Do not duplicate** content already captured elsewhere — plan docs, design
  records, commits, diffs. Reference them by path instead.
- **Redact secrets** — API keys, tokens, anything from auth/credential files.
- If the user passed an argument, treat it as what the next session will focus on
  and tailor the doc accordingly.

<!-- Adapted from mattpocock/skills (MIT). -->
