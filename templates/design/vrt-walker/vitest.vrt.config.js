import { defineConfig } from 'vitest/config'

/**
 * Tier-3 visual regression project (D6/D22). Runs as its own `test:vrt`
 * script, serialized — see templates/design/gate-wiring.md for why it is
 * NOT folded into the main per-slice test run.
 *
 * The environment fields below MUST stay pinned: tier-3 baselines are only
 * deterministic within one fixed browser build/viewport/DPR (D22). Bumping
 * any of them is a re-baselining operation (a distinct, single-commit
 * change with a gestalt spot-check), never an incidental drift.
 */
export default defineConfig({
  resolve: {
    // Mirror the host app's source aliases (vite config / tsconfig paths) —
    // this project imports story files that import app code; without the
    // aliases every story import fails to resolve here.
    alias: {
      // {{SOURCE_ALIASES}} e.g.: '@renderer': resolve(__dirname, 'src/renderer/src')
      // (import { resolve } from 'path' when filling this in)
    }
  },
  test: {
    name: 'vrt',
    include: ['{{VRT_WALKER_DIR}}/**/*.vrt.{{EXT}}'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [
        {
          browser: 'chromium',
          // Pin the exact Chromium build used to capture baselines (D22) —
          // record it here, not just in a comment, so a CI/local mismatch
          // is a config diff, not a silent flake.
          launch: { channel: '{{PINNED_CHROMIUM_BUILD}}' }
        }
      ],
      viewport: { width: Number('{{VIEWPORT_WIDTH}}'), height: Number('{{VIEWPORT_HEIGHT}}') },
      screenshotDirectory: 'design/screenshots'
    },
    // Never parallelize tier-3 files against each other — documented
    // Chromium launch-contention flakiness (C16/C8).
    fileParallelism: false
  }
})
