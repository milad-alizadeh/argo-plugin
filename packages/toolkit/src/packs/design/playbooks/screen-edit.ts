/**
 * `screen-edit` playbook spec (playbook-engine-phase1.md Slice 11, step 32;
 * design doc "Playbook matrices #4"): `update-brief` → `component-impact` →
 * `targeted-edits` → `review`.
 *
 * The brief is updated FIRST ("it's the verify contract") so `review`'s
 * `fresh-eyes-review` judges the finished screen against the UPDATED brief,
 * not the stale one `screen-create` produced.
 *
 * `component-impact` mirrors `screen-create`'s `missing-components`: the run
 * itself diffs the updated brief against the registry/kit and spawns
 * `component-edit` / `component-create` runs for any component the PRD
 * changed — the screen run never mutates a component master inline.
 *
 * `targeted-edits` is warm across sections (`repeat: 'section'`), absorbing
 * `design-rules-check` fix rounds in-session (`maxRounds`) before a fresh
 * retry (`retries`) — same escalation shape as `screen-create`'s `build`.
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

registerPlaybook(screenEditSpec)
