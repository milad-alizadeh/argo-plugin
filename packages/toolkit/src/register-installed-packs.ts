/**
 * Single pack-registration composition-root seam (templates/rules/file-structure.md
 * "side-effect imports for registration happen in exactly ONE composition root").
 *
 * Lives outside both `core/` and `adapter-claude/`: it imports `packs/design`
 * directly, so it cannot sit under `core/` (core may not import packs) or
 * under `adapter-claude/` (adapter-claude may not import packs either) without
 * tripping the dependency-cruiser boundary rules. Every process-level caller
 * that needs pack playbooks/gates registered — `bin/argo.js`'s `playbook`
 * case, the `playbook-permission` hook, `cli/playbook-list.ts` — imports THIS
 * module instead of reaching into `packs/design` themselves.
 */
import { registerCliGates } from './packs/design/gates/register-cli-gates.js'
// Side-effectful: pack-design's playbook modules call `registerPlaybook` at
// import time (Slice 5's registry model) — importing this namespace IS the
// catalog population step, and is also the source of truth for `packOfSpec`'s
// identity check below.
import * as designPlaybooks from './packs/design/playbooks/index.js'
import type { PlaybookSpec } from './core/index.js'

let gatesRegistered = false

/** Idempotent: safe to call from every composition root that may need packs. */
export function registerInstalledPacks(): void {
  if (gatesRegistered) return
  gatesRegistered = true
  registerCliGates()
}

/**
 * Identity-based pack attribution: a spec exported by pack-design's playbook
 * barrel belongs to pack `design`. Future packs add their barrel here; a spec
 * registered by no known pack reports `unknown` rather than guessing.
 */
export function packOfSpec(spec: PlaybookSpec): string {
  const designSpecs = new Set<unknown>(
    Object.values(designPlaybooks as Record<string, unknown>).filter(
      (v) => Boolean(v && typeof v === 'object' && 'name' in v && 'stages' in v)
    )
  )
  return designSpecs.has(spec) ? 'design' : 'unknown'
}
