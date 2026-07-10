# argo — a portable engineering "way of working" for Claude Code

Argo turns Claude Code into an opinionated development pipeline: every stage of
product, design, code, and shipped work is owned by a skill or agent, and the
seams between stages are guarded by mechanical gates, so quality is enforced,
not requested. It ships as two pieces: this plugin (the thin Claude-facing
layer of skills, agents, and hook wiring) and
[`@argohq/toolkit`](packages/toolkit) (one npm package holding every line of
executable logic).

**Full docs: [milad-alizadeh.github.io/argo-plugin](https://milad-alizadeh.github.io/argo-plugin/)**
— the pipeline, the gates, the trust model, how to set up design, and the
complete skill/agent/playbook reference all live there. This README is a
signpost, not a mirror.

## Install

```
/plugin marketplace add milad-alizadeh/argo-plugin
/plugin install argo@argo            # project scope recommended
/argo:init                           # adapt to this project
```

`/argo:init` detects your stack and, with per-rule consent, writes what a
project actually keeps — nothing executable is copied into your repo; that
stays in the kit.

## Repo

- [`packages/toolkit`](packages/toolkit) — `@argohq/toolkit`, the deterministic half.
- [`apps/docs`](apps/docs) — the docs site's source.
- Issues and contributions: [github.com/milad-alizadeh/argo-plugin](https://github.com/milad-alizadeh/argo-plugin).
