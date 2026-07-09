/**
 * `argo playbook list --json` — the host app's catalog derivation surface
 * (argo-v2 PRD `playbooks-and-runs.md` RUNS-R24: "all playbook surfaces
 * render from `argo playbook list --json`; no hand-maintained catalog in the
 * app").
 *
 * Emits every registered playbook's full spec as JSON: name/slug, owning
 * pack, version, stages (each with its exit-gate name), and the input
 * contract (`playbookStart`'s `{ name, target, key? }` shape).
 *
 * Version provenance: specs deliberately do NOT carry their own version
 * field (they are pure shape data, versioned with the code that registers
 * them), so each entry's `version` is the installed @argohq/toolkit package
 * version, stamped with `versionSource: "toolkit-package"` so the host app
 * never mistakes it for a per-playbook semver.
 */
import { readFileSync } from 'node:fs'
// Side-effectful barrel import: pack-design's playbook modules call
// `registerPlaybook(...)` at import time (Slice 5's registry model), so this
// import IS the catalog population step.
import * as designPlaybooks from '../packs/design/playbooks/index.js'
import { listPlaybooks, type PlaybookSpec, type StageSpec } from '../core/index.js'

export interface PlaybookCatalogStage {
  name: string
  /** Exit gate name, or null when the stage has no gate. */
  gate: string | null
  requires: string[]
  allows: string[]
  produces?: string[]
  policy?: string
  skill?: string
  session?: string
  retries?: number
  repeat?: string
  maxRounds?: number
  handsOffToPack?: string
}

export interface PlaybookCatalogEntry {
  /** Registry name — also the CLI slug (`argo playbook start --name <slug>`). */
  name: string
  slug: string
  /**
   * Pretty display name for UI surfaces (host PRD RUNS-R12: "pretty names
   * everywhere in UI; slugs only in CLI text"). An authored `displayName` on
   * the spec wins when present; otherwise falls back to the slug in
   * sentence case, hyphens to spaces ("screen-create" → "Screen create").
   */
  displayName: string
  pack: string
  version: string
  versionSource: 'toolkit-package'
  stages: PlaybookCatalogStage[]
  /** `playbookStart`'s input contract. */
  input: {
    target: { required: true; description: string }
    key: { required: false; description: string }
  }
}

function toCatalogStage(stage: StageSpec): PlaybookCatalogStage {
  const { name, gate, requires, allows, produces, policy, skill, session, retries, repeat, maxRounds, handsOffToPack } =
    stage
  return {
    name,
    gate: gate ?? null,
    requires: requires ?? [],
    allows,
    ...(produces !== undefined ? { produces } : {}),
    ...(policy !== undefined ? { policy } : {}),
    ...(skill !== undefined ? { skill } : {}),
    ...(session !== undefined ? { session } : {}),
    ...(retries !== undefined ? { retries } : {}),
    ...(repeat !== undefined ? { repeat } : {}),
    ...(maxRounds !== undefined ? { maxRounds } : {}),
    ...(handsOffToPack !== undefined ? { handsOffToPack } : {})
  }
}

/**
 * Pretty name derivation. An authored `displayName` on the spec wins when
 * present; otherwise falls back to a slug-derived sentence-case string:
 * slug → sentence case, hyphens → spaces.
 */
export function displayNameFor(spec: PlaybookSpec & { displayName?: string }): string {
  if (typeof spec.displayName === 'string' && spec.displayName.length > 0) return spec.displayName
  const words = spec.name.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Pure catalog shaping (unit-tested): specs + pack attribution + version in,
 * catalog entries out.
 */
export function buildPlaybookCatalog(
  specs: PlaybookSpec[],
  { version, packOf }: { version: string; packOf: (spec: PlaybookSpec) => string }
): PlaybookCatalogEntry[] {
  return specs.map((spec) => ({
    name: spec.name,
    slug: spec.name,
    displayName: displayNameFor(spec),
    pack: packOf(spec),
    version,
    versionSource: 'toolkit-package',
    stages: spec.stages.map(toCatalogStage),
    input: {
      target: {
        required: true,
        description:
          'The unit this run operates on (screen name, plan basename, component name) — fed to the instance key. Plan targets must be the plan BASENAME, never a path.'
      },
      key: { required: false, description: 'Override the derived instance key (mostly for tests wanting a stable key).' }
    }
  }))
}

/** The installed toolkit version — read from this package's own package.json. */
export function toolkitVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  return pkg.version
}

/**
 * Identity-based pack attribution: a spec exported by pack-design's playbook
 * barrel belongs to pack `design`. Future packs add their barrel here; a spec
 * registered by no known pack reports `unknown` rather than guessing.
 */
function packOfSpec(spec: PlaybookSpec): string {
  // definePlaybook<T> narrows each exported spec to its literal shape, so
  // membership is checked by identity over `unknown` values.
  const designSpecs = new Set<unknown>(
    Object.values(designPlaybooks as Record<string, unknown>).filter(
      (v) => Boolean(v && typeof v === 'object' && 'name' in v && 'stages' in v)
    )
  )
  return designSpecs.has(spec) ? 'design' : 'unknown'
}

/** The full catalog for the CLI verb: every registered spec, catalog-shaped. */
export function runPlaybookList(): PlaybookCatalogEntry[] {
  return buildPlaybookCatalog(listPlaybooks(), { version: toolkitVersion(), packOf: packOfSpec })
}
