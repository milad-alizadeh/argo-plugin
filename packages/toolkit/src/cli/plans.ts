/**
 * `argo plans` — the plan-lifecycle view. Merges three sources, split by who
 * can truthfully know each fact:
 *
 *  - **frontmatter** (`status: draft | queued`) — authored state, committed
 *    with the plan. Intentionally NOT live: a build in progress never edits
 *    plan status (a worktree-side flip is invisible on main and a lie if the
 *    branch is discarded).
 *  - **git** — `landed` is DERIVED, never stamped: a plan whose
 *    last-touching commit is an ancestor of origin/main (fallback: main),
 *    with no local modifications and no active run. A commit cannot embed
 *    its own SHA, so a `landed` frontmatter field is physically impossible
 *    to keep truthful; git already records the answer.
 *  - **home run store** (`~/.argo/state/<project-id>/`) — live overlay
 *    ("building at stage X"). Join contract: a run's `target` equals the
 *    plan's BASENAME (validated at `playbook start`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { plansDir } from '../config/argo-paths.js'
import { defaultStateRoot, resolveProjectId, type PlaybookInstance } from '../core/state.js'

export type PlanFrontmatterStatus = 'draft' | 'queued'

export interface PlanFrontmatter {
  /** null when frontmatter is missing or `status` is absent/outside the enum. */
  status: PlanFrontmatterStatus | null
  updated: string | null
}

/** Parse the plan's YAML frontmatter block. Only the two known fields; a
 * status outside the enum reads as null (the enum is draft|queued — nothing
 * else, deliberately no `landed`). */
export function parsePlanFrontmatter(content: string): PlanFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return { status: null, updated: null }
  const block = match[1]
  const field = (name: string): string | null => {
    const m = new RegExp(`^${name}:\\s*([^#\\r\\n]*)`, 'm').exec(block)
    return m ? m[1].trim() || null : null
  }
  const rawStatus = field('status')
  const status = rawStatus === 'draft' || rawStatus === 'queued' ? rawStatus : null
  return { status, updated: field('updated') }
}

export interface LiveRun {
  key: string
  playbook: string
  stage: string
  status: string
}

export interface PlanEntry {
  /** Basename, the plan↔run join key (e.g. "my-feature.md"). */
  plan: string
  /** Repo-relative path under .argo/plans/. */
  path: string
  /** draft | queued from frontmatter; `landed` derived from git; `invalid`
   * when frontmatter is missing or outside the enum. */
  status: PlanFrontmatterStatus | 'landed' | 'invalid'
  updated: string | null
  /** Present when the home store has an in-flight run targeting this plan. */
  run?: LiveRun
}

export interface ListPlansOptions {
  hostRoot: string
  /** Test seam — defaults to ~/.argo/state. */
  stateRoot?: string
}

function git(hostRoot: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', hostRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** True when the plan's last-touching commit is merged into origin/main
 * (fallback main) and the working copy carries no local modifications. */
function isLanded(hostRoot: string, relPath: string): boolean {
  const dirty = git(hostRoot, ['status', '--porcelain', '--', relPath])
  if (dirty === null || dirty !== '') return false
  const lastSha = git(hostRoot, ['log', '-1', '--format=%H', '--', relPath])
  if (!lastSha) return false
  const ref = git(hostRoot, ['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : 'main'
  try {
    execFileSync('git', ['-C', hostRoot, 'merge-base', '--is-ancestor', lastSha, ref], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function liveRuns(hostRoot: string, stateRoot: string): Map<string, LiveRun> {
  const runs = new Map<string, LiveRun>()
  const dir = join(stateRoot, resolveProjectId(hostRoot), 'playbooks')
  if (!existsSync(dir)) return runs
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    let instance: PlaybookInstance
    try {
      instance = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      continue // torn/foreign file — never crashes the listing
    }
    if (instance?.status !== 'in-progress' || typeof instance.target !== 'string') continue
    runs.set(instance.target, {
      key: file.slice(0, -'.json'.length),
      playbook: instance.playbook,
      stage: instance.stage,
      status: instance.status
    })
  }
  return runs
}

/** List every plan in `.argo/plans/` with its merged status + live overlay. */
export function listPlans({ hostRoot, stateRoot }: ListPlansOptions): PlanEntry[] {
  const dir = plansDir(hostRoot)
  if (!existsSync(dir)) return []
  const runs = liveRuns(hostRoot, stateRoot ?? defaultStateRoot())
  const entries: PlanEntry[] = []
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md')) continue
    const relPath = join('.argo', 'plans', file)
    const { status, updated } = parsePlanFrontmatter(readFileSync(join(dir, file), 'utf8'))
    const run = runs.get(file)
    const landed = !run && isLanded(hostRoot, relPath)
    const entry: PlanEntry = {
      plan: file,
      path: relPath,
      status: landed ? 'landed' : (status ?? 'invalid'),
      updated
    }
    if (run) entry.run = run
    entries.push(entry)
  }
  return entries
}

/** The build-plan gate: refuse any plan not explicitly cleared for build.
 * `queued` is what earns the enum its keep — a `draft` (or missing/invalid
 * frontmatter) plan may not be built. */
export function assertPlanQueued(planPath: string): void {
  if (!existsSync(planPath)) {
    throw new Error(`argo plans check: no plan file at ${planPath}`)
  }
  const { status } = parsePlanFrontmatter(readFileSync(planPath, 'utf8'))
  if (status !== 'queued') {
    throw new Error(
      `argo plans check: "${basename(planPath)}" has status "${status ?? 'missing/invalid'}" — only a ` +
        `\`status: queued\` plan may be built. Set frontmatter \`status: queued\` once the plan is cleared for build.`
    )
  }
}
