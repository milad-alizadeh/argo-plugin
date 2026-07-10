/**
 * Single pack-registration composition-root seam (templates/rules/file-structure.md
 * "side-effect imports for registration happen in exactly ONE composition root").
 *
 * Lives outside both `core/` and `adapter-claude/`: it imports `packs/design`
 * directly, so it cannot sit under `core/` (core may not import packs) or
 * under `adapter-claude/` (adapter-claude may not import packs either) without
 * tripping the dependency-cruiser boundary rules. Every process-level caller
 * that needs pack playbooks/gates registered — `bin/argo.js`'s `playbook`
 * case, the `playbook-permission` hook — imports THIS module instead of
 * reaching into `packs/design` themselves.
 *
 * Pack attribution (which pack a registered spec belongs to) is core-owned,
 * not this module's job: each playbook module calls `registerPlaybook(spec,
 * 'design')` at import time (Slice 5's registry model), and core's own
 * `getPlaybookPack` answers the lookup — see `core/cli/playbook-list.ts`.
 * `cli/playbook-list.ts` therefore imports only core, never this hub.
 */
import { registerCliGates } from './packs/design/gates/register-cli-gates.js'
// Side-effectful: pack-design's playbook modules call `registerPlaybook` at
// import time (Slice 5's registry model) — importing this namespace IS the
// catalog population step.
import './packs/design/playbooks/index.js'

let gatesRegistered = false

/** Idempotent: safe to call from every composition root that may need packs. */
export function registerInstalledPacks(): void {
  if (gatesRegistered) return
  gatesRegistered = true
  registerCliGates()
}
