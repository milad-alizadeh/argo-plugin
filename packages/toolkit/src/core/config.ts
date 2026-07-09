import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * `.argo/config.json` reader — the new home for `packs`/`noPlaybook`/
 * `testDiscipline`/`land`, per the plan's open question 1 (`.claude/argo.json`
 * stays untouched, read separately by design-commit-gate for its own
 * `design.<app>` block — this module never reads or writes that file).
 * Deliberately a NEW, separate module from `packages/toolkit/src/config/
 * argo-json.ts`'s `findArgoJson` — same walk-up-to-nearest-file idiom, but a
 * different file (`.argo/config.json`, not `.claude/argo.json`) and a
 * different shape, so it is not imported from here.
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

export interface ArgoConfig {
  /** Which packs are installed/enabled. Default: `{}`. */
  packs: PackAvailability
  /** Behavior when no playbook instance is active for the current target.
   * `"allow"` passes every tool call through unconditionally; `"deny-edits"`
   * blocks file-edit-shaped action kinds and coaches the agent to start a
   * playbook first (enforced by adapter-claude's hook, not here). Default:
   * `"allow"` — the one default explicitly named in the design doc. */
  noPlaybook: 'allow' | 'deny-edits'
  /** Reserved for pack-code's TDD policies (`test-first`/`reproduce-first`/
   * `tests-stay-green`) — phase 2. Default: `undefined` (no discipline
   * configured; meaningless without pack-code to enforce it). */
  testDiscipline?: unknown
  /** Reserved for the `land` playbook's settings (`land.mode`) — phase 2.
   * Default: `undefined` (no land config; the playbook doesn't exist yet). */
  land?: unknown
}

const DEFAULT_CONFIG: ArgoConfig = {
  packs: {},
  noPlaybook: 'allow',
  testDiscipline: undefined,
  land: undefined
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
      noPlaybook: parsed.noPlaybook === 'deny-edits' ? 'deny-edits' : DEFAULT_CONFIG.noPlaybook,
      testDiscipline: 'testDiscipline' in parsed ? parsed.testDiscipline : DEFAULT_CONFIG.testDiscipline,
      land: 'land' in parsed ? parsed.land : DEFAULT_CONFIG.land
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
