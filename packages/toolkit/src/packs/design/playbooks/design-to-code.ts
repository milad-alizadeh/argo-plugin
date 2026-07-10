/**
 * `design-to-code` playbook spec: `metadata-reads` -> `resolve-imports` ->
 * `code-handoff`.
 *
 * `code-handoff` is the terminal stage, hands off by name to a `pack-code`
 * playbook that does not exist yet in this repo. `playbookStart` checks pack
 * availability before writing the initial instance, so a project without
 * `pack-code` enabled is refused at `playbook start`, never mid-run.
 *
 * This spec is unusable end-to-end until a real `pack-code` exists; it is
 * committed now as the settled soft-seam shape, not as a runnable playbook.
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

registerPlaybook(designToCodeSpec, 'design')
