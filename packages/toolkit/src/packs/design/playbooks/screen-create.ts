/**
 * `screen-create` playbook spec: `brief` -> `missing-components` -> `build`
 * -> `review` -> `registry-sync`. PRD+grill+ASCII wireframe happen upstream,
 * interactive and not stage-tracked; the spec starts at the per-screen brief.
 *
 * `missing-components` is a plain stage whose skill triggers `component-create`
 * for any component the brief references without a registry card yet, not
 * spec-level branching.
 *
 * `build` uses one warm session across sections, absorbing fix rounds
 * in-session (`maxRounds`) before falling back to a fresh retry (`retries`)
 * once the fix budget is exhausted.
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const screenCreateSpec = definePlaybook({
  name: 'screen-create',
  displayName: 'Create screen',
  stages: [
    {
      name: 'brief',
      allows: ['file-edit', 'figma-read'],
      produces: ['design/briefs/<key>.md'],
      gate: 'brief-check',
      skill: 'design-screen',
      session: 'fresh'
    },
    {
      name: 'missing-components',
      requires: ['brief'],
      allows: ['file-read', 'figma-read', 'playbook-start'],
      skill: 'design-screen',
      session: 'fresh'
    },
    {
      name: 'build',
      requires: ['brief', 'missing-components'],
      allows: ['figma-write', 'figma-read', 'file-edit'],
      produces: ['figma:<key>', 'manifests/<key>.json'],
      gate: 'design-rules-check',
      skill: 'design-screen',
      session: 'warm',
      repeat: 'section',
      maxRounds: 2,
      retries: 2
    },
    {
      name: 'review',
      requires: ['build'],
      allows: ['figma-read'],
      gate: 'fresh-eyes-review',
      maxRounds: 1,
      retries: 1
    },
    {
      name: 'registry-sync',
      requires: ['review'],
      allows: ['registry-write']
    }
  ]
})

registerPlaybook(screenCreateSpec, 'design')
