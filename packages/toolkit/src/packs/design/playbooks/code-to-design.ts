/**
 * `code-to-design` playbook spec: `drift-detect` -> `patch-mirror` ->
 * `registry-card` -> `instance-impact-check` -> `review`.
 *
 * `drift-detect`'s gate requires a live screenshot capture a bare CLI process
 * can't supply, so it is registered session-side only; a headless advance
 * fails loud with `GateNotFoundError` rather than fake a verdict.
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
      name: 'registry-card',
      requires: ['patch-mirror'],
      allows: ['registry-write']
    },
    {
      name: 'instance-impact-check',
      requires: ['registry-card'],
      allows: ['file-read', 'figma-read']
    },
    {
      name: 'review',
      requires: ['instance-impact-check'],
      allows: ['figma-read'],
      gate: 'fresh-eyes-review',
      maxRounds: 1,
      retries: 1
    }
  ]
})

registerPlaybook(codeToDesignSpec, 'design')
