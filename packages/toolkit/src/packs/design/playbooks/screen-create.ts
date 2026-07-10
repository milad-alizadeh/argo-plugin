/**
 * `screen-create` playbook spec (playbook-engine-phase1.md Slice 11, step 29;
 * design doc "Playbook matrices #1"): PRD+grill+ASCII wireframe happen
 * upstream of this spec (interactive, not stage-tracked) — the spec starts at
 * the per-screen brief.
 *
 * `brief` → `missing-components` → `build` → `review` → `registry-sync`.
 *
 * `missing-components` is cross-playbook dependency resolution ("Missing
 * components?"), not a branch: per the settled "no branch field" ruling, this
 * is a plain stage whose skill triggers `component-create` for any component
 * the brief references that the registry doesn't already carry a card for —
 * core has no spawn-playbook spec field in phase 1, so this is ordinary
 * stage/skill business logic, not new spec vocabulary.
 *
 * `build` is "fresh start, warm across sections+fix-rounds" (step 29): one
 * designer session (`session: 'warm'`) iterates per-section (`repeat:
 * 'section'`) and absorbs `design-rules-check` fix rounds in-session
 * (`maxRounds`) before falling back to a fresh retry (`retries`) if the fix
 * budget is exhausted — the doc's retry-then-fresh-session escalation.
 *
 * `review` is `fresh-eyes-review` vs the brief, `maxRounds: 1` then
 * `retries: 1` per step 29's "maxRounds: 1, then retries".
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
