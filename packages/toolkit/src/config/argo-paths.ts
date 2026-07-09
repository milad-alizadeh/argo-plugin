/**
 * `.argo/` — argo's ONLY per-project directory — resolved in ONE place so a
 * future move is a single edit (the old `.claude/argo.json` location was
 * inlined at emit-shims, argo-json and init independently; consolidation
 * plan: `.argo/plans/playbook-rename-phase2.md` item 5).
 *
 * Layout:
 *   .argo/config.json   — the consolidated per-project config (committed)
 *   .argo/plans/        — plan docs (committed)
 *   .argo/design/       — human-authored design docs (committed)
 *   .argo/evidence/     — worktree-local gate plumbing (gitignored):
 *                         build-mode.json, red-proof.json, launch-receipt.json.
 *                         Deliberately NOT named "state": it is evidence about
 *                         one worktree's uncommitted files, read only by that
 *                         worktree's own gates, dead when the worktree is
 *                         removed — the opposite lifetime of `~/.argo/state/`.
 *
 * Everything else in `.argo/` (secrets like `figma-token`, session-local
 * receipts) stays gitignored via the deny-by-default pattern (see
 * `GITIGNORE_BLOCK`).
 */

import { join } from 'node:path'

export const ARGO_DIR = '.argo'

/** Repo-relative path of the per-project config file. */
export const ARGO_CONFIG_RELPATH = join(ARGO_DIR, 'config.json')

export function argoConfigPath(root: string): string {
  return join(root, ARGO_DIR, 'config.json')
}

export function plansDir(root: string): string {
  return join(root, ARGO_DIR, 'plans')
}

export function designDocsDir(root: string): string {
  return join(root, ARGO_DIR, 'design')
}

export function evidenceDir(root: string): string {
  return join(root, ARGO_DIR, 'evidence')
}

export function buildModePath(root: string): string {
  return join(evidenceDir(root), 'build-mode.json')
}

export function redProofPath(root: string): string {
  return join(evidenceDir(root), 'red-proof.json')
}

export function launchReceiptPath(root: string): string {
  return join(evidenceDir(root), 'launch-receipt.json')
}

/**
 * Deny-by-default gitignore block for `.argo/` — NEVER a blanket narrow.
 * `.argo/` also holds secrets and session-local files (a live `figma-token`
 * PAT, `design-guard.json`, `audit-receipts/`); narrowing the ignore to one
 * subdir would stage the token on the next `git add -A`. Only the three
 * committed surfaces are re-included.
 */
export const GITIGNORE_BLOCK = ['/.argo/*', '!/.argo/config.json', '!/.argo/plans/', '!/.argo/design/']
