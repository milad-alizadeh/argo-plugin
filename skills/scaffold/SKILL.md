---
name: scaffold
description: Scaffold a brand-new project or app from its canonical generator into an empty directory, then make the initial commit. Use when the user wants to start, scaffold, or bootstrap a new project/app — e.g. "scaffold an Electron app in apps/desktop", "start a new Next.js project", "/scaffold". Resolves the right generator for the requested stack and delegates execution to the scaffolder agent.
---

# Scaffold a New Project

Turn "scaffold a `<stack>` app into `<dir>`" into a clean, committed starting point —
one command, no hand-holding.

## 1. Resolve target + generator
- **Target dir** from the request (e.g. `apps/desktop`); for a single-app repo default
  to the current directory. It MUST be empty before scaffolding.
- **Canonical generator** for the requested stack — the stack's own official generator,
  invoked non-interactively where it supports it. Illustrative (always confirm the
  *current* command/flags against the generator's docs — never invent flags):
  - electron-vite + React + TS → `@quick-start/electron` (e.g. `bun create @quick-start/electron@latest <dir>`, template `react-ts`)
  - Next.js → `create-next-app` (`--ts`, `--use-bun`, …)
  - Vite SPA → `create-vite` (`--template react-ts`)
- Respect the project's package manager (bun/pnpm/npm) if one is already established.

## 2. Delegate to the scaffolder agent
Invoke the **`scaffolder`** subagent with the resolved target dir and the EXACT generator
command. The agent enforces the safety contract: confirms the dir is empty (halts if not),
runs the generator verbatim (no substitutions), audits staged files for secrets, and makes
the initial commit using the repo's own git identity and signing. Do not re-implement that
here — this skill only resolves *what* to run; the agent owns *running it safely*.

## 3. Report
Relay the scaffolder's one-line result (generator + commit SHA).

## 4. Chain into project setup
After a successful scaffold, **hand off to the `init` skill** (`/argo:init`) to wire the new
project's `.claude/` — rules adapted to the just-scaffolded stack, the `@argohq/toolkit`
dependency, graphify, a
`CLAUDE.md` with the canonical loop, and the stack-detected LSP wiring offer (`init`
§8c) — the freshly-scaffolded stack's language is known deterministically here, so
this is the natural first moment to offer wiring its LSP server. `init` reads `package.json` to detect the
stack, so it runs immediately after scaffolding (deps install / build / dev server are
separate follow-ups). For a **monorepo**, scaffold each app first, then run
`/argo:init` once at the root — it discovers all workspaces and is idempotent, so
re-running is safe.
