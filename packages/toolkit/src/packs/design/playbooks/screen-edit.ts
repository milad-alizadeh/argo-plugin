/**
 * `screen-edit` playbook spec: `update-brief` -> `component-impact` ->
 * `targeted-edits` -> `review`.
 *
 * The brief is updated first, since it is `review`'s verify contract: the
 * judge checks the finished screen against the updated brief, not a stale one.
 *
 * `component-impact` diffs the updated brief against the registry/kit and
 * spawns component runs for any changed component; the screen run never
 * mutates a component master inline.
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const screenEditSpec = definePlaybook({
  name: 'screen-edit',
  displayName: 'Edit screen',
  stages: [
    {
      name: 'update-brief',
      allows: ['file-edit'],
      produces: ['design/briefs/<key>.md'],
      gate: 'brief-check',
      skill: 'design-screen',
      session: 'fresh'
    },
    {
      name: 'component-impact',
      requires: ['update-brief'],
      allows: ['file-read', 'figma-read', 'registry-read', 'playbook-start'],
      skill: 'design-screen',
      session: 'fresh'
    },
    {
      name: 'targeted-edits',
      requires: ['update-brief', 'component-impact'],
      allows: ['file-edit', 'figma-write', 'figma-read'],
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
      requires: ['targeted-edits'],
      allows: ['figma-read'],
      gate: 'fresh-eyes-review',
      maxRounds: 1,
      retries: 1
    }
  ]
})

registerPlaybook(screenEditSpec, 'design')
