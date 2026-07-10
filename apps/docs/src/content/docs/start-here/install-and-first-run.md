---
title: Install and first run
description: Add Argo to a project and initialize it.
---

Argo installs as a Claude Code plugin scoped to one project, there is no global install and no fork.

## Add the plugin

Install the argo-plugin marketplace entry the way you install any Claude Code plugin, then run:

```
/argo:init
```

`argo:init` detects the project's stack, package manager, existing test runner, monorepo shape, whatever's already there, and writes only what the project actually keeps. It asks before writing anything durable:

- **Landing mode**, whether a finished branch merges straight to the default branch (solo maintainer) or goes through a pull request.
- **The no-playbook policy**, how code edits with no registered playbook are treated (`allow`, `coach`, or `deny-edits`).
- **Rules**, which of the shipped rule templates (testing discipline, engineering principles, comment discipline, and others) get installed into the project's own `.claude/rules/`, adapted to the detected stack.

Everything init writes is removable in one step, and nothing it writes is a hidden default, the report at the end lists exactly what landed where.

## Confirm the install

After init finishes, `argo status --host-root .` reports the project's TDD, boundary, and LSP posture against what's actually on disk, a quick sanity check that the gates are wired the way the report says they are.

Continue to [your first gated build](/start-here/your-first-gated-build/) to run a feature through the pipeline end to end.
