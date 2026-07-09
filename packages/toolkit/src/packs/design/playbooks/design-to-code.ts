/**
 * `design-to-code` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 33; design doc "Playbook matrices #5"): `metadata-reads` →
 * `resolve-imports` → `code-handoff`.
 *
 * `metadata-reads` is `get_metadata` outline first, then per-section
 * `get_design_context` (both Figma-read plumbing, not stage-distinguished in
 * phase 1's flat-list spec — modeled as one read-only stage).
 *
 * `resolve-imports` uses pack-design's registry cards to resolve Figma
 * instances to real code imports (`registry-read`, no writes).
 *
 * `code-handoff` is the TERMINAL stage and carries `handsOffToPack:
 * 'pack-code'` (audit 2.4's soft seam): it hands off BY NAME to pack-code's
 * `screen-implement`, which does not exist yet in this repo. `playbookStart`
 * (from `@argohq/toolkit/core`) reads `handsOffToPack` off `stages.at(-1)` and calls
 * `assertPackAvailable` before writing the initial instance — so a project
 * with `pack-code` disabled (or absent) in `.argo/config.json`'s `packs`
 * block is refused with `PackUnavailableError` at `playbook start`, never
 * mid-run at the handoff itself. See `design-to-code.test.ts` for the actual
 * `playbookStart` exercise of this refusal (and the enabled-pack pass-through
 * case, using a stub `packs.pack-code: true` config entry since pack-code
 * itself doesn't exist to register a real playbook).
 */
import { definePlaybook, registerPlaybook } from '../../../core/index.js'

export const designToCodeSpec = definePlaybook({
  name: 'design-to-code',
  displayName: 'Design to code',
  stages: [
    {
      name: 'metadata-reads',
      allows: ['figma-read'],
      skill: 'figma-to-code',
      session: 'fresh'
    },
    {
      name: 'resolve-imports',
      requires: ['metadata-reads'],
      allows: ['file-read', 'registry-read']
    },
    {
      name: 'code-handoff',
      requires: ['resolve-imports'],
      allows: ['playbook-start'],
      handsOffToPack: 'pack-code'
    }
  ]
})

registerPlaybook(designToCodeSpec)
