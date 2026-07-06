/**
 * Host-side spec-diff shim TEMPLATE (installed at `<app>/test/spec-diff/` —
 * decision 14). THIN on purpose: already-imported glob maps go to the
 * @argohq/kit/walkers factory, which owns the walk + assertions (D20
 * comparators, per-mode differential checks) — a kit upgrade updates the
 * gate logic without re-templating, and a host-side rename can't fork it.
 * Prefer generating this file with `argo design emit-shims` (reads
 * .claude/argo.json design.<app>.walkers); the {{…}} slots exist for manual
 * installs by the setup-design skill.
 */
import { runSpecDiffWalker } from '@argohq/kit/walkers'
import { composeStories } from '{{STORYBOOK_TEST_PACKAGE}}'

const stories = import.meta.glob('{{STORIES_GLOB}}', { eager: true })
const specs = import.meta.glob('{{DESIGN_SPECS_GLOB}}', { eager: true })

// Specs pair with stories by basename: <name>.stories.<ext> ↔ <name>.stories.json.
const specByBase = Object.fromEntries(
  Object.entries(specs).map(([path, mod]) => [path.split('/').pop().replace(/\.json$/, ''), mod.default ?? mod])
)
const specsByComponent = Object.fromEntries(
  Object.keys(stories).map((path) => [path, specByBase[path.split('/').pop().replace(/\.[cm]?[jt]sx?$/, '')]])
)

runSpecDiffWalker({ stories, specsByComponent, composeStories })
