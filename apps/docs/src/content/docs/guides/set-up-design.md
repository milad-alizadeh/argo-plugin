---
title: Set up design
description: Wire the Figma-to-code design pack into a project.
---

The design pack is the Figma-to-code half of Argo — component and screen builds, hygiene audits, and the sync that keeps generated code matched to the design source of truth. It's optional: a project with no Figma source of truth skips this entirely.

## Run the wizard

```
/argo:setup-design
```

The wizard mirrors `init`'s shape: it asks before it writes anything, batches related decisions into one question, and always proposes rather than imposes. It first asks whether the project actually uses Figma — if not, it explains why the pack doesn't apply and stops there, rather than forcing a Figma workflow onto a project that doesn't want one.

## What it installs

- **shadcn init** — the component primitives the generated code builds on.
- **Storybook plus a Vitest addon** — the harness component-level visual and interaction tests run against.
- **VRT and spec-diff walker shims** — the acceptance gates that compare generated code against the synced design source.
- **Gate wiring and a lint rule** — hooked into the same commit-gate mechanism the rest of the pipeline uses.
- **The project's `design.<app>` block in `.argo/config.json`** — for a monorepo, this fills one app's block per run; the wizard asks which app first.

## After setup

Once the pack is installed, `/argo:figma-sync` pulls the design source of truth into committed artifacts, and `/argo:figma-to-code` generates component code from what was synced — through the normal test-first loop, gated by the tiered acceptance checks described in [the pipeline](/how-it-works/the-pipeline/).

Continue to [resolve Figma comments](/guides/resolve-figma-comments/) for the review-feedback loop once components are live in Figma.
