import { defineConfig } from 'vitest/config'

// TEMP cross-repo TDD-guard bridge (delete after use): runs this repo's test
// suite with the tdd-guard reporter registered to the invoking session's
// project root (argo-v2), so plugin-repo implementation edits validate
// against the plugin's own real red/green runs.
export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs'],
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: '/Users/milad/Developer/argo-v2' }]]
  }
})
