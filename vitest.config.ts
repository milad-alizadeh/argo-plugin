import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Feed tdd-guard from this repo's test runs — without this reporter the guard
// sees no red/green evidence for hook edits and blocks them. projectRoot is
// THIS repo (standalone since the argo-v2 extraction), not a parent monorepo.
const repoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    // Co-located tests repo-wide (owner ruling 2026-07-06): every unit test
    // lives next to its subject (hooks/, packages/kit/src/**, eval/lib/);
    // test/ keeps only shared fixtures/helpers and the dual-mode acid suites.
    include: [
      'hooks/**/*.test.mjs',
      'packages/**/*.test.{js,mjs,ts}',
      'eval/**/*.test.mjs',
      'evals/**/*.test.mjs',
      'test/**/*.test.mjs'
    ],
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: repoRoot }]]
  }
})
