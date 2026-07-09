/**
 * `code-to-design` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 34; design doc "Playbook matrices #6"): `drift-detect` → `patch-mirror` →
 * `card-refresh` → `instance-impact-check`.
 *
 * `drift-detect` runs the deterministic `design-matches-code` comparator
 * gate up front to find drift between the live code and Figma before any
 * mirroring happens.
 *
 * `instance-impact-check` mirrors `component-edit.ts`'s `instance-impact-scan`
 * stage SHAPE (same `allows`, read-only, no gate) rather than duplicating its
 * implementation — both are the same blind spot-check mechanism, referenced
 * per the plan's "playbook no.3's mechanism, referenced not duplicated".
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const codeToDesignSpec = definePlaybook({
  name: 'code-to-design',
  displayName: 'Code to design',
  stages: [
    {
      name: 'drift-detect',
      allows: ['file-read', 'figma-read'],
      gate: 'design-matches-code',
      skill: 'figma-sync',
      session: 'fresh'
    },
    {
      name: 'patch-mirror',
      requires: ['drift-detect'],
      allows: ['file-edit', 'figma-write'],
      gate: 'design-rules-check',
      retries: 2
    },
    {
      name: 'card-refresh',
      requires: ['patch-mirror'],
      allows: ['registry-write']
    },
    {
      // Mirrors component-edit.ts's `instance-impact-scan` stage shape (see
      // module doc comment) — same `allows`, read-only, no gate.
      name: 'instance-impact-check',
      requires: ['card-refresh'],
      allows: ['file-read', 'figma-read']
    }
  ]
})

registerPlaybook(codeToDesignSpec)
