/**
 * `code-to-design` playbook spec (playbook-engine-phase1.md Slice 11, step
 * 34; design doc "Playbook matrices #6"): `drift-detect` → `patch-mirror` →
 * `registry-card` → `instance-impact-check` → `review`.
 *
 * `drift-detect` runs the deterministic `design-matches-code` comparator
 * gate up front to find drift between the live code and Figma before any
 * mirroring happens. That gate is registered SESSION-side only
 * (`register-cli-gates.ts` deliberately excludes it) because it requires a
 * live screenshot capture a bare CLI process can't supply — a headless
 * advance of `drift-detect` fails loud with `GateNotFoundError` rather than
 * fake a verdict; this stage only ever advances through a session that
 * supplies the screenshot.
 *
 * `registry-card` unifies with `component-create`'s and `component-edit`'s
 * stage of the same name (one registry card write; create-vs-refresh is
 * business logic, not distinct spec vocabulary).
 *
 * `instance-impact-check` mirrors `component-edit.ts`'s `instance-impact`
 * stage SHAPE (same `allows`, read-only, no gate) rather than duplicating its
 * implementation — both are the same blind spot-check mechanism, referenced
 * per the plan's "playbook no.3's mechanism, referenced not duplicated".
 *
 * `review` is the blind fresh-eyes pass every other design spec's terminal
 * flow gets (`fresh-eyes-review`, `maxRounds: 1`, `retries: 1`,
 * `allows: ['figma-read']`) — added for review parity across every design
 * playbook, code-to-design included.
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
      // Mirrors component-edit.ts's `instance-impact` stage shape (see
      // module doc comment) — same `allows`, read-only, no gate.
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

registerPlaybook(codeToDesignSpec)
