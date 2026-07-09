/**
 * Host-side VRT shim TEMPLATE (installed at `<app>/test/vrt/` — decision 14).
 * THIN on purpose: already-imported glob maps go to the @argohq/toolkit/walkers
 * factory, which owns the walk (D22 baseline counting, story×mode screenshot
 * assertions) — a kit upgrade updates the gate logic without re-templating.
 * Prefer generating this file with `argo design emit-shims` (reads
 * .argo/config.json design.<app>.walkers); the {{…}} slots exist for manual
 * installs by the setup-design skill.
 */
import { runVrtWalker } from '@argohq/toolkit/walkers'
import { composeStories } from '{{STORYBOOK_TEST_PACKAGE}}'

const stories = import.meta.glob('{{STORIES_GLOB}}', { eager: true })
const committedBaselines = import.meta.glob('{{BASELINES_GLOB}}')

runVrtWalker({ stories, composeStories, committedBaselines })
