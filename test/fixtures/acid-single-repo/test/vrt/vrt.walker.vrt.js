/**
 * Host-side VRT shim (stays at test/vrt/ — decision 14): passes
 * already-imported modules + the committed-baselines glob map to the kit's
 * walker factory, never paths.
 */
import { runVrtWalker } from '@argohq/kit/walkers'

const stories = import.meta.glob('../../stories/*.stories.js', { eager: true })
const committedBaselines = import.meta.glob('../../design/screenshots/**/*.png')

runVrtWalker({
  stories,
  composeStories: (storyModule) => ({ ...storyModule }),
  committedBaselines,
})
