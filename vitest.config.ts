import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Co-located tests repo-wide (owner ruling 2026-07-06): every unit test
    // lives next to its subject (packages/kit/src/**, eval/lib/); test/ keeps
    // only shared fixtures/helpers and the dual-mode acid suites. hooks/ no
    // longer carries any executable JS or tests (2026-07-10) — hooks/hooks.json
    // dispatches every route to the host-installed @argohq/toolkit, whose hook
    // logic + tests live under packages/toolkit/src/hooks/.
    include: [
      'packages/**/*.test.{js,mjs,ts}',
      'eval/**/*.test.mjs',
      'evals/**/*.test.mjs',
      'test/**/*.test.mjs'
    ],
    reporters: ['default']
  }
})
