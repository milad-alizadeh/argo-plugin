import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Feed tdd-guard from this repo's test runs — without this reporter the guard
// sees no red/green evidence for hook edits and blocks them. projectRoot is
// THIS repo (standalone since the argo-v2 extraction), not a parent monorepo.
const repoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: repoRoot }]]
  }
})
