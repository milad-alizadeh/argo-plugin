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
Relay the scaffolder's one-line result (generator + commit SHA). Note that installing
dependencies, building, and starting a dev server are separate follow-up steps, outside
scaffolding.
