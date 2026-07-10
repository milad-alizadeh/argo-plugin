import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * `.argo/config.json` reader — a declarative INDEX of posture flags and
 * pointers at third-party tool configs (`packs`/`noPlaybook`/
 * `testDiscipline`/`boundaryLint`/`landing`/`provenance`), never a wrapper
 * that re-encodes those tools' own settings: `testDiscipline` and
 * `boundaryLint` name WHO enforces a posture and WHERE its real config
 * lives (`probity.config.ts`, `.dependency-cruiser.cjs`) — the tool config
 * itself stays untouched and un-duplicated. Since the `.argo/`
 * consolidation the SAME file also carries the `design.<app>` blocks, read
 * separately by design-commit-gate via
 * `packages/toolkit/src/config/argo-json.ts`'s `findArgoJson` — same
 * walk-up-to-nearest-file idiom, but a different shape slice (design
 * authoring config, not posture/pointers), so it is not imported from here
 * (core stays free of the config package). The two `ArgoConfig` types
 * coexist because they cover disjoint concerns; `argo status`
 * (`cli/status.ts`) is the one place that resolves this index against
 * on-disk reality.
 *
 * Read LIVE per call — no session-start cache, per the settled decision (a
 * config edit mid-session must take effect on the next hook invocation).
 * Missing file or malformed JSON both resolve to defaults, never a throw —
 * this will be called from a PreToolUse hook path (adapter-claude, later
 * slice) where a thrown config reader would fail a tool call for an
 * unrelated reason.
 */

/** Per-pack enabled/disabled map, e.g. `{ "pack-design": true, "pack-code": false }`.
 * A pack absent from this map is treated as disabled (deny-by-default) —
 * see `assertPackAvailable`. Default: `{}` (every pack disabled). */
export type PackAvailability = Record<string, boolean>

/** WHO enforces test discipline and WHERE its real config lives — a pointer,
 * not a wrapper. `probity` is the only enforcer wired today (this repo's own
 * `probity.config.ts`); the shape stays generic (`enforcedBy` is a string,
 * not a union) so a future host can name a different tool without a schema
 * change. */
export interface TestDisciplinePosture {
  enforcedBy: string
  configPath: string
}

/** WHO enforces module-boundary rules and WHERE its config lives, same
 * pointer shape as `TestDisciplinePosture`. `waivers` names repo-relative
 * paths exempted from the boundary check (kept in the index itself, unlike
 * `configPath`, because waivers are an argo-side posture decision — not part
 * of the underlying tool's own config). Default: `[]`. */
export interface BoundaryLintPosture {
  enforcedBy: string
  configPath: string
  waivers: string[]
}

export interface ArgoConfig {
  /** Which packs are installed/enabled. Default: `{}`. */
  packs: PackAvailability
  /** Behavior when no playbook instance is active for the current target.
   * `"allow"` passes every tool call through unconditionally; `"coach"`
   * allows edit-shaped action kinds but injects advisory context suggesting
   * a playbook start; `"deny-edits"` blocks them outright with the same
   * coaching (enforced by adapter-claude's hook, not here). Default:
   * `"allow"` — the one default explicitly named in the design doc. */
  noPlaybook: 'allow' | 'coach' | 'deny-edits'
  /** Pointer at the tool enforcing TDD, e.g.
   * `{ enforcedBy: 'probity', configPath: 'probity.config.ts' }`. Default:
   * `undefined` (no discipline configured). Read by `argo status` to flag a
   * `configPath` that doesn't exist on disk. */
  testDiscipline?: TestDisciplinePosture
  /** Pointer at the tool enforcing module-boundary rules, e.g.
   * `{ enforcedBy: 'dependency-cruiser', configPath: '.dependency-cruiser.cjs',
   * waivers: [] }`. Default: `undefined` (no boundary lint configured). */
  boundaryLint?: BoundaryLintPosture
  /** The landing/merge mode a host's `land` playbook reads (e.g. `"pr"` or
   * `"merge"`) — written by `argo init` (`cli/init.ts`) under this name
   * (renamed from a dead, never-read `land` key that no reader ever
   * matched). Kept `unknown` here since the land playbook itself owns and
   * validates the value shape. Default: `undefined`. */
  landing?: unknown
  /** Repo-relative installed path (e.g. `.claude/rules/testing.md`) ->
   * source template hash, recorded by `argo init` at install time
   * (skills/init/SKILL.md §5). Covers any file argo installs from a
   * template — rules today, lefthook/probity/depcruise starters later. Read
   * by `argo rules status` (`provenance.ts`'s `diffProvenance`) to flag
   * drift against the plugin's CURRENT template — advisory only, never a
   * gate. A file absent from this map (hand-installed, or predates
   * provenance tracking) is never flagged. Default: `{}`. */
  provenance: Record<string, string>
}

const DEFAULT_CONFIG: ArgoConfig = {
  packs: {},
  noPlaybook: 'allow',
  testDiscipline: undefined,
  boundaryLint: undefined,
  landing: undefined,
  provenance: {}
}

/** Walk up from `cwd` to the nearest `.argo/config.json`, returning its
 * absolute path, or `null` if none is found before the filesystem root. */
function findConfigPath(cwd: string): string | null {
  let dir = resolve(cwd)
  while (true) {
    const candidate = join(dir, '.argo', 'config.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Reads `.argo/config.json` live (no caching), walking up from `cwd`
 * (defaults to `process.cwd()`) to the nearest match. Missing file or
 * malformed JSON both resolve to `DEFAULT_CONFIG` — never throws. Keys
 * absent from a present-but-partial file fall back to their individual
 * defaults (a file with only `{ "noPlaybook": "deny-edits" }` still reads
 * `packs` as `{}`). */
export function readConfig(cwd: string = process.cwd()): ArgoConfig {
  const path = findConfigPath(cwd)
  if (!path) return { ...DEFAULT_CONFIG }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG }
    return {
      packs: typeof parsed.packs === 'object' && parsed.packs !== null ? parsed.packs : DEFAULT_CONFIG.packs,
      noPlaybook:
        parsed.noPlaybook === 'deny-edits' || parsed.noPlaybook === 'coach'
          ? parsed.noPlaybook
          : DEFAULT_CONFIG.noPlaybook,
      testDiscipline: 'testDiscipline' in parsed ? parsed.testDiscipline : DEFAULT_CONFIG.testDiscipline,
      boundaryLint: 'boundaryLint' in parsed ? parsed.boundaryLint : DEFAULT_CONFIG.boundaryLint,
      landing: 'landing' in parsed ? parsed.landing : DEFAULT_CONFIG.landing,
      provenance:
        typeof parsed.provenance === 'object' && parsed.provenance !== null
          ? parsed.provenance
          : DEFAULT_CONFIG.provenance
    }
  } catch {
    return { ...DEFAULT_CONFIG } // malformed config — inert, never a crash inside a hook
  }
}

/** Thrown by `assertPackAvailable` when a playbook's terminal stage hands off
 * to a pack that is disabled (or absent) in config — named so callers
 * (`playbook-start.ts`, Slice 5) can distinguish it from other start-time
 * errors. */
export class PackUnavailableError extends Error {
  constructor(
    public readonly playbookName: string,
    public readonly requiredPack: string
  ) {
    super(
      `playbook "${playbookName}" hands off to pack "${requiredPack}", which is disabled — enable it in ` +
        `.argo/config.json's "packs" block before starting this playbook`
    )
    this.name = 'PackUnavailableError'
  }
}

/** Refuses a cross-pack playbook at start time when its terminal stage hands
 * off to a disabled pack (audit 2.4) — e.g. pack-design's `design-to-code`
 * handing off to pack-code's `screen-implement`. Called once at
 * `playbook-start.ts` time, never mid-run: a pack that gets disabled after a
 * playbook is already in flight is not re-checked here. A pack absent from
 * `config.packs` is treated as disabled (deny-by-default), matching
 * `PackAvailability`'s documented default. */
export function assertPackAvailable(playbookName: string, requiredPack: string, config: ArgoConfig): void {
  if (!config.packs[requiredPack]) {
    throw new PackUnavailableError(playbookName, requiredPack)
  }
}
