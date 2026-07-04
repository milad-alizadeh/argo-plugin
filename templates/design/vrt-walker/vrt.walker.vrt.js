import { describe, it, expect } from 'vitest'
import { composeStories } from '{{STORYBOOK_TEST_PACKAGE}}'
// {{...}} import path for the generated story index / a glob of *.stories.{{EXT}}
import * as allStories from '{{STORIES_GLOB_OR_INDEX}}'

/**
 * Tier-3 visual regression walker (D6): enumerates every story via
 * composeStories and asserts its render against the COMMITTED baseline
 * screenshot in design/screenshots/<Component>/<variant>.<mode>.png.
 *
 * Ordering is enforced by D22: baselines are only ever committed after a
 * recorded tier-2 gestalt PASS. This walker never writes a first-run
 * baseline unattended in a hands-off build — see /argo:figma-to-code, which
 * owns that ordering.
 */
for (const [storyFile, storyModule] of Object.entries(allStories)) {
  const composed = composeStories(storyModule)

  describe(`vrt: ${storyFile}`, () => {
    for (const [storyName, Story] of Object.entries(composed)) {
      for (const mode of ['light', 'dark']) {
        it(`${storyName} (${mode}) matches its committed baseline`, async () => {
          const { container } = await Story.run({ parameters: { theme: mode } })
          await expect(container).toMatchScreenshot(`${storyFile}/${storyName}.${mode}.png`)
        })
      }
    }
  })
}
