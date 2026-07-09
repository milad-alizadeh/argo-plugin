import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Finding, GateVerdict } from './gate.js'

/**
 * State store: `~/.argo/state/<project-id>/playbooks/<key>.json`, per the
 * design doc's "state store" seam. Sibling to `packages/toolkit/src/lib/
 * repo-root.ts`'s `resolveRepoRoot` but deliberately NOT imported from there
 * (core has no dependency on kit) — this is the generalized form: project-id
 * is derived from `git rev-parse --git-common-dir`, not `--show-toplevel`, so
 * two worktrees of the same repo (which have different toplevels but share
 * one `.git` common dir) resolve to the same store.
 *
 * KNOWN LIMIT (stated, not fixed): project-id is path-identity-bound — the
 * realpath of the git common dir. Moving or renaming the repo on disk orphans
 * any in-flight run records under the old id; the plan they tracked simply
 * reads `queued` again (`argo plans` finds no live run to overlay). Accepted
 * per the `.argo/` consolidation plan.
 */
export function resolveProjectId(cwd: string): string {
  const identity = gitCommonDirIdentity(cwd) ?? resolve(cwd)
  return createHash('sha1').update(identity).digest('hex')
}

function gitCommonDirIdentity(cwd: string): string | null {
  try {
    const commonDir = execFileSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8'
    }).trim()
    if (!commonDir) return null
    const resolved = resolve(cwd, commonDir)
    // Git resolves symlinks inconsistently between the plain-repo case
    // (relative ".git", resolved against whatever `cwd` we were given) and
    // the worktree case (an absolute path git itself already realpath'd) —
    // e.g. macOS's /tmp -> /private/tmp. realpath both so a worktree and its
    // main repo checkout (same underlying `.git` dir) always match.
    try {
      return realpathSync(resolved)
    } catch {
      return resolved
    }
  } catch {
    return null // not a git repo — fall back to cwd identity
  }
}

/** Attempt record: one gate-failure round within a stage's retry budget. */
export interface Attempt {
  round: number
  gate: string
  findings: Finding[]
  whatWasTried: string
}

/** History record: one gate run's verdict, appended when a stage is exited. */
export interface HistoryEntry {
  stage: string
  gate: string
  at: string
  verdict: GateVerdict
  /**
   * Set to `false` by `argo playbook adopt` (audit 2.1) when the stage's gate
   * declared itself non-re-runnable (`GateVerdict.rerunnable === false`), so
   * this entry records "a verdict exists but adopt could not independently
   * re-confirm it" rather than a normal re-verified boundary. Omitted for
   * history entries written by `playbook-advance`, which always runs the
   * gate live.
   */
  verified?: boolean
}

/** A playbook instance's full on-disk state. */
export interface PlaybookInstance {
  playbook: string
  target: string
  stage: string
  status: string
  attempts: Attempt[]
  history: HistoryEntry[]
}

export interface StateOptions {
  /** Directory to derive the project-id from. Defaults to `process.cwd()`. */
  cwd?: string
  /** Root of the state store. Defaults to `~/.argo/state` — override in tests
   * so they never touch the real home directory. */
  stateRoot?: string
}

export function defaultStateRoot(): string {
  return join(homedir(), '.argo', 'state')
}

/** Derives a stable instance key from a playbook name + target, for CLI verbs
 * that start from `{ name, target }` rather than an existing key (`playbook-
 * start`, `playbook-adopt`). Slugified so an arbitrary target string (a
 * screen name, a file path) is always a safe filename component. */
export function deriveInstanceKey(playbook: string, target: string): string {
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '') || 'x'
  return `${slug(playbook)}--${slug(target)}`
}

function instancePath(key: string, opts: StateOptions = {}): string {
  const projectId = resolveProjectId(opts.cwd ?? process.cwd())
  const stateRoot = opts.stateRoot ?? defaultStateRoot()
  return join(stateRoot, projectId, 'playbooks', `${key}.json`)
}

/** Reads an instance by key. Returns `null` — the documented sentinel for "no
 * instance exists yet" — when the file is missing OR malformed (never throws
 * from a read, matching `findArgoJson`'s inert-on-malformed convention). */
export function readInstance(key: string, opts: StateOptions = {}): PlaybookInstance | null {
  const path = instancePath(key, opts)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PlaybookInstance
  } catch {
    return null
  }
}

/** Atomic JSON write: temp file in the SAME directory (same fs, so rename is
 * atomic) + `renameSync`. A bare `writeFileSync` can tear under a crash and a
 * torn instance file reads as "no instance" — silently erasing a run. */
function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

const LOCK_STALE_MS = 5_000
const LOCK_WAIT_MS = 2_000

/** Advisory lockfile around a same-key read-modify-write. Best effort: a
 * stale lock (holder crashed) is stolen after LOCK_STALE_MS; if the lock
 * can't be acquired within LOCK_WAIT_MS the write proceeds anyway (advisory,
 * never a deadlock) — atomicWriteJson still guarantees no torn file, the
 * lock only narrows the lost-append window between two live writers. */
function withAdvisoryLock<T>(path: string, fn: () => T): T {
  const lockPath = `${path}.lock`
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + LOCK_WAIT_MS
  let held = false
  while (!held) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
      held = true
    } catch {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { force: true })
          continue
        }
      } catch {
        continue // lock vanished between failure and stat — retry immediately
      }
      if (Date.now() > deadline) break // advisory: proceed unlocked
    }
  }
  try {
    return fn()
  } finally {
    if (held) rmSync(lockPath, { force: true })
  }
}

/** Writes (creates or overwrites) the instance at `key`, creating parent dirs
 * as needed. Atomic (temp + rename). Whole-instance replace — the append-only
 * guarantee for `attempts`/`history` is enforced by `recordAttempt`/
 * `recordHistory` below, not by this function. */
export function writeInstance(key: string, instance: PlaybookInstance, opts: StateOptions = {}): void {
  atomicWriteJson(instancePath(key, opts), instance)
}

/** Appends one attempt to `attempts[]` and persists — never mutates or drops
 * a prior entry, only ever grows the array. Throws if no instance exists yet
 * at `key` (callers must `writeInstance` the initial instance first).
 * The read-append-write runs under an advisory per-key lock. */
export function recordAttempt(key: string, attempt: Attempt, opts: StateOptions = {}): PlaybookInstance {
  return withAdvisoryLock(instancePath(key, opts), () => {
    const instance = readInstance(key, opts)
    if (!instance) throw new Error(`no instance for key "${key}" — writeInstance first`)
    const updated: PlaybookInstance = { ...instance, attempts: [...instance.attempts, attempt] }
    writeInstance(key, updated, opts)
    return updated
  })
}

/** Appends one entry to `history[]` and persists — same append-only
 * guarantee (and advisory lock) as `recordAttempt`. */
export function recordHistory(key: string, entry: HistoryEntry, opts: StateOptions = {}): PlaybookInstance {
  return withAdvisoryLock(instancePath(key, opts), () => {
    const instance = readInstance(key, opts)
    if (!instance) throw new Error(`no instance for key "${key}" — writeInstance first`)
    const updated: PlaybookInstance = { ...instance, history: [...instance.history, entry] }
    writeInstance(key, updated, opts)
    return updated
  })
}

/**
 * "Active instance" pointer — `<stateRoot>/<projectId>/active-playbooks/
 * <worktreeId>.json` containing `{ key, worktree }`. There is no other
 * project-wide way to answer "which instance is active right now" for a hook
 * that only sees a `cwd`, not a `{ playbook, target }` pair:
 * `deriveInstanceKey` is deterministic GIVEN a target, but the target itself
 * (a screen name, a branch) isn't observable from a generic PreToolUse tool
 * call. `playbook-start` (and `adopt`) write this pointer so the
 * last-started/adopted instance is what the permission hook (adapter-claude's
 * `runPermissionHook`, wired in `@argohq/toolkit`) reads as "the" active
 * instance.
 *
 * WORKTREE AFFINITY: the pointer is a keyed SET, one entry per worktree
 * (keyed by the sha1 of the cwd's worktree toplevel). A single per-project
 * pointer let two concurrent gated builds overwrite each other, so worktree
 * A's permission gate read worktree B's run. Instances themselves stay
 * project-scoped (shared store via the git common dir); only "which one is
 * active HERE" is per-worktree.
 */
function worktreeId(cwd: string): string {
  let identity: string
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    identity = top ? realpathSafe(top) : resolve(cwd)
  } catch {
    identity = resolve(cwd)
  }
  return createHash('sha1').update(identity).digest('hex')
}

function realpathSafe(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function activePointerPath(opts: StateOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd()
  const projectId = resolveProjectId(cwd)
  const stateRoot = opts.stateRoot ?? defaultStateRoot()
  return join(stateRoot, projectId, 'active-playbooks', `${worktreeId(cwd)}.json`)
}

/** Marks `key` as the active playbook instance for THIS worktree (atomic). */
export function setActiveInstance(key: string, opts: StateOptions = {}): void {
  atomicWriteJson(activePointerPath(opts), { key })
}

/** Returns the active instance's key, or `null` if no pointer exists or it is
 * malformed (never throws — same inert-on-malformed convention as
 * `readInstance`). */
export function getActiveInstanceKey(opts: StateOptions = {}): string | null {
  const path = activePointerPath(opts)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return typeof parsed?.key === 'string' ? parsed.key : null
  } catch {
    return null
  }
}

/** Resolves the active pointer and reads that instance — `null` if there is
 * no active pointer OR the pointed-at instance file is missing/malformed. */
export function getActiveInstance(opts: StateOptions = {}): PlaybookInstance | null {
  const key = getActiveInstanceKey(opts)
  if (!key) return null
  return readInstance(key, opts)
}
