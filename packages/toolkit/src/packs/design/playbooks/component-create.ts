/**
 * `component-create` playbook spec: `exists-check` -> `build` -> `annotate`
 * -> `registry-card`.
 *
 * `exists-check` is a guard (registry lookup; early exit if a card already
 * exists), modeled as an ordinary stage, not spec-level branching.
 *
 * `build` resolves code-owned vs figma-build inside the stage's skill by
 * reading the `@code-owned` annotation, never a spec branch field.
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const componentCreateSpec = definePlaybook({
  name: 'component-create',
  displayName: 'Create component',
  stages: [
    {
      name: 'exists-check',
      allows: ['registry-read', 'figma-read'],
      skill: 'design-component',
      session: 'fresh'
    },
    {
      name: 'build',
      requires: ['exists-check'],
      allows: ['file-edit', 'figma-write', 'figma-read'],
      skill: 'design-component',
      session: 'fresh'
    },
    {
      name: 'annotate',
      requires: ['build'],
      allows: ['file-edit', 'figma-write', 'figma-read'],
      gate: 'design-rules-check',
      retries: 2
    },
    {
      // Judge sees only the built component and the ask, never the transcript.
      name: 'review',
      requires: ['annotate'],
      allows: ['figma-read'],
      gate: 'fresh-eyes-review',
      maxRounds: 1,
      retries: 1
    },
    {
      name: 'registry-card',
      requires: ['review'],
      allows: ['registry-write']
    }
  ]
})

registerPlaybook(componentCreateSpec, 'design')
