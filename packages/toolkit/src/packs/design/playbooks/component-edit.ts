/**
 * `component-edit` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 31; design doc "Playbook matrices #3"): `edit` → `review` →
 * `registry-card` → `instance-impact`.
 *
 * `review` is the blind fresh-eyes pass every designer output gets (screens
 * had it from day one; components gained it 2026-07-10): a judge that sees
 * ONLY the finished component + the ask it was built against, never the
 * working transcript — the deterministic audit catches hygiene, this
 * catches "reads wrong".
 *
 * `edit` resolves "code-owned? code-first : figma-edit" inside the stage's
 * skill (reads the `@code-owned` annotation), not a spec branch — same
 * mechanism as `component-create`'s `build` stage.
 *
 * `registry-card` unifies with `component-create`'s stage of the same name:
 * both write exactly one registry card (create vs refresh-in-place is the
 * skill's business logic, not distinct spec vocabulary).
 *
 * `instance-impact` is a blind spot-check over screens that consume this
 * component (read-only — it never edits, only surfaces impact). Its stage
 * shape (`allows`, no gate) is the one `code-to-design.ts`'s
 * `instance-impact-check` mirrors rather than duplicates.
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
