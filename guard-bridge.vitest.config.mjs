import { defineConfig } from 'vitest/config'

// Cross-repo TDD-guard bridge (NEW-B, de-hardcoded 2026-07-05): this repo's
// own vitest.config.ts points its tdd-guard reporter at itself, which is
// wrong for a session whose CALLING project is a different repo (e.g.
// argo-v2, editing this plugin repo directly) — that session's tdd-guard
// only trusts evidence written to ITS OWN project's evidence store. This
// config re-runs the same test suite with the reporter pointed at whichever
// project invoked it, so cross-repo plugin-edit sessions validate against
// real red/green runs instead of being permanently blocked for "no
// evidence." `projectRoot` is read from the environment, not hardcoded, so
// this file works for any calling project without editing it per session.
export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs', 'packages/**/*.test.{js,mjs}'],
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }]]
  }
})
