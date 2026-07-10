/**
 * `component-create` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 30; design doc "Playbook matrices #2"): `exists-check` → `build` →
 * `annotate` → `registry-card`.
 *
 * `exists-check` is a guard (registry lookup + `search_design_system`; "no
 * card = doesn't exist") with an early-`done` exit when it finds the
 * component already has a registry card — per the settled ruling this is a
 * guard, not stage branching, so it is modeled as an ordinary first stage;
 * the early-exit itself is engine/runtime behavior (a stage's gate/skill
 * concluding there is nothing left to do), not a spec-level field.
 *
 * `build` resolves "code-owned? code-first-then-mirror : figma-build" inside
 * the stage's skill by reading the `@code-owned` annotation / registry
 * metadata — never a spec branch field, per the "no branch field" ruling.
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
      // Blind fresh-eyes pass — every designer output gets one (components
      // gained it 2026-07-10, matching screens): judge sees only the built
      // component + the ask, never the transcript.
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
