import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Feed tdd-guard from this workspace's test runs too — without this reporter
// the guard sees no red/green evidence for plugin/hooks edits and blocks them.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  test: {
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: repoRoot }]]
  }
})
