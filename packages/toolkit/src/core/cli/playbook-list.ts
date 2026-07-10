/**
 * Emits every registered playbook's full spec as JSON: name/slug, owning
 * pack, version, stages (each with its exit-gate name), and the input
 * contract.
 *
 * Specs deliberately do NOT carry their own version field (pure shape data,
 * versioned with the code that registers them) — each entry's `version` is
 * the installed toolkit package version, stamped `versionSource:
 * "toolkit-package"` so callers never mistake it for a per-playbook semver.
 */
import { readFileSync } from 'node:fs'
import { getPlaybookPack, listPlaybooks, type PlaybookSpec, type StageSpec } from '../index.js'

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
   * Pretty display name for UI surfaces. An authored `displayName` on the
   * spec wins when present; otherwise falls back to the slug in sentence
   * case, hyphens to spaces ("screen-create" → "Screen create").
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

/** An authored `displayName` on the spec wins when present; otherwise falls back to a slug-derived sentence-case string. */
export function displayNameFor(spec: PlaybookSpec & { displayName?: string }): string {
  if (typeof spec.displayName === 'string' && spec.displayName.length > 0) return spec.displayName
  const words = spec.name.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Pure catalog shaping: specs + pack attribution + version in, catalog entries out. */
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

export function toolkitVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
  return pkg.version
}

/**
 * Pack attribution by name lookup against core's own registry, populated at
 * registration time by whichever composition root called `registerPlaybook`.
 * Core never imports the pack-loading hub to get this — the hub tells core
 * the attribution when it registers.
 */
function packOf(spec: PlaybookSpec): string {
  return getPlaybookPack(spec.name)
}

/** The full catalog for the CLI verb: every registered spec, catalog-shaped. */
export function runPlaybookList(): PlaybookCatalogEntry[] {
  return buildPlaybookCatalog(listPlaybooks(), { version: toolkitVersion(), packOf })
}
