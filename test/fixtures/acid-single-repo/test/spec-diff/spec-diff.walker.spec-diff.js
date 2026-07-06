/**
 * Host-side spec-diff shim (stays at test/spec-diff/ — decision 14): passes
 * already-imported modules to the kit's walker factory, never paths. A real
 * host passes its Storybook package's composeStories; this fixture uses a
 * storybook-free stand-in (story modules are already runnable objects).
 */
import { runSpecDiffWalker } from '@argohq/kit/walkers'
import specs from '../../design/specs/button.stories.json'

const stories = import.meta.glob('../../stories/*.stories.js', { eager: true })

runSpecDiffWalker({
  stories,
  specsByComponent: Object.fromEntries(Object.keys(stories).map((path) => [path, specs])),
  composeStories: (storyModule) => ({ ...storyModule }),
})
