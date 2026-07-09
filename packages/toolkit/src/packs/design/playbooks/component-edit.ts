/**
 * `component-edit` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 31; design doc "Playbook matrices #3"): `edit` → `card-refresh` →
 * `instance-impact-scan`.
 *
 * `edit` resolves "code-owned? code-first : figma-edit" inside the stage's
 * skill (reads the `@code-owned` annotation), not a spec branch — same
 * mechanism as `component-create`'s `build` stage.
 *
 * `instance-impact-scan` is a blind spot-check over screens that consume this
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
      name: 'card-refresh',
      requires: ['edit'],
      allows: ['registry-write']
    },
    {
      name: 'instance-impact-scan',
      requires: ['card-refresh'],
      allows: ['file-read', 'figma-read']
    }
  ]
})

registerPlaybook(componentEditSpec)
