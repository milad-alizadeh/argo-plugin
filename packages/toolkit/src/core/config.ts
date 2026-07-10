import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * `.argo/config.json` reader: a declarative index of posture flags and
 * pointers at third-party tool configs, never a wrapper that re-encodes
 * those tools' own settings.
 *
 * Read live per call, no caching: a config edit mid-session must take
 * effect on the next hook invocation. Missing file or malformed JSON both
 * resolve to defaults, never a throw, since a thrown config reader would
 * fail a tool call for an unrelated reason inside a hook.
 */

/** Per-pack enabled/disabled map. A pack absent from this map is treated as
 * disabled (deny-by-default). Default: `{}` (every pack disabled). */
export type PackAvailability = Record<string, boolean>

/** WHO enforces test discipline and WHERE its real config lives, a pointer
 * not a wrapper. `enforcedBy` stays a string, not a union, so a future host
 * can name a different tool without a schema change. */
export interface TestDisciplinePosture {
  enforcedBy: string
  configPath: string
}

/** WHO enforces module-boundary rules and WHERE its config lives, same
 * pointer shape as `TestDisciplinePosture`. `waivers` is kept in the index
 * itself since it's an argo-side posture decision, not the underlying
 * tool's own config. Default: `[]`. */
export interface BoundaryLintPosture {
  enforcedBy: string
  configPath: string
  waivers: string[]
}

/** Per-language LSP wiring posture: `"wired"` records only that the
 * language's server is wired in Claude Code's own surface (never duplicated
 * here); `"recommended-not-installed"` means a curated language was detected
 * but the user declined or deferred wiring it. A language absent from this
 * map was never offered. Default: `{}`. */
export type LspTooling = Record<string, 'wired' | 'recommended-not-installed'>

/** Tool-posture index rows keyed by tool family, following the same
 * pointer-not-wrapper convention as `testDiscipline`/`boundaryLint`. */
export interface ToolingPosture {
  lsp: LspTooling
}

export interface ArgoConfig {
  /** Which packs are installed/enabled. Default: `{}`. */
  packs: PackAvailability
  /** Behavior when no playbook instance is active for the current target.
   * `"allow"` passes every tool call through unconditionally; `"coach"`
   * allows edit-shaped action kinds but injects advisory context suggesting
   * a playbook start; `"deny-edits"` blocks them outright with the same
   * coaching. Default: `"allow"`. */
  noPlaybook: 'allow' | 'coach' | 'deny-edits'
  /** Pointer at the tool enforcing TDD. Default: `undefined` (no discipline
   * configured). */
  testDiscipline?: TestDisciplinePosture
  /** Pointer at the tool enforcing module-boundary rules. Default:
   * `undefined` (no boundary lint configured). */
  boundaryLint?: BoundaryLintPosture
  /** The landing/merge mode a host's `land` playbook reads. Kept `unknown`
   * since the land playbook itself owns and validates the value shape.
   * Default: `undefined`. */
  landing?: unknown
  /** Repo-relative installed path to source template hash, covering any
   * file argo installs from a template. Used to flag drift against the
   * plugin's current template, advisory only, never a gate. A file absent
   * from this map is never flagged. Default: `{}`. */
  provenance: Record<string, string>
  /** Which LSP servers argo has wired or recommended, keyed by tool family
   * then language. Default: `{ lsp: {} }`. */
  tooling: ToolingPosture
}

const DEFAULT_CONFIG: ArgoConfig = {
  packs: {},
  noPlaybook: 'allow',
  testDiscipline: undefined,
  boundaryLint: undefined,
  landing: undefined,
  provenance: {},
  tooling: { lsp: {} }
}

/** Walks up from `cwd` to the nearest `.argo/config.json`, returning its
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

/** Reads `.argo/config.json` live (no caching), walking up from `cwd` to the
 * nearest match. Missing file or malformed JSON both resolve to
 * `DEFAULT_CONFIG`, never throws. Keys absent from a partial file fall back
 * to their individual defaults. */
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
          : DEFAULT_CONFIG.provenance,
      tooling: readToolingPosture(parsed.tooling)
    }
  } catch {
    return { ...DEFAULT_CONFIG } // malformed config stays inert, never a crash inside a hook
  }
}

/** Validates and defaults a parsed `tooling` block: an absent/malformed
 * `tooling` or `tooling.lsp` both resolve to `{ lsp: {} }`; a present `lsp`
 * map is read verbatim, per-key value validity is not enforced here. */
function readToolingPosture(parsedTooling: unknown): ToolingPosture {
  if (!parsedTooling || typeof parsedTooling !== 'object') return { lsp: {} }
  const lsp = (parsedTooling as { lsp?: unknown }).lsp
  return { lsp: typeof lsp === 'object' && lsp !== null ? (lsp as LspTooling) : {} }
}

/** Thrown by `assertPackAvailable` when a playbook's terminal stage hands off
 * to a pack that is disabled (or absent) in config, named so callers can
 * distinguish it from other start-time errors. */
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
 * off to a disabled pack. Called once at start time, never mid-run: a pack
 * disabled after a playbook is already in flight is not re-checked here. A
 * pack absent from `config.packs` is treated as disabled (deny-by-default). */
export function assertPackAvailable(playbookName: string, requiredPack: string, config: ArgoConfig): void {
  if (!config.packs[requiredPack]) {
    throw new PackUnavailableError(playbookName, requiredPack)
  }
}
