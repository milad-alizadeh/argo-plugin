/**
 * `component-edit` playbook spec: `edit` -> `review` -> `registry-card` ->
 * `instance-impact`.
 *
 * `review` is a judge that sees only the finished component and the ask,
 * never the working transcript: the deterministic audit catches hygiene,
 * this catches "reads wrong".
 *
 * `edit` resolves code-owned vs figma-edit inside the stage's skill (reads
 * the `@code-owned` annotation), not a spec branch.
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const componentEditSpec = definePlaybook({
  name: 'component-edit',
  displayName: 'Edit component',
  stages: [
    {
      name: 'edit',
      allows: ['file-edit', 'figma-write', 'figma-read'],
      gate: 'design-rules-check',
      skill: 'design-component',
      session: 'fresh',
      retries: 2
    },
    {
      name: 'review',
      requires: ['edit'],
      allows: ['figma-read'],
      gate: 'fresh-eyes-review',
      maxRounds: 1,
      retries: 1
    },
    {
      name: 'registry-card',
      requires: ['review'],
      allows: ['registry-write']
    },
    {
      name: 'instance-impact',
      requires: ['registry-card'],
      allows: ['file-read', 'figma-read']
    }
  ]
})

registerPlaybook(componentEditSpec, 'design')
