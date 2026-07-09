#!/usr/bin/env node
/**
 * Design-guard record (PostToolUse on the Figma `use_figma` write tool).
 *
 * SELF-SCOPING: entirely inert unless a `design.<app>` block in
 * `.claude/argo.json` at the session's git toplevel carries a `recipe` (the
 * design-pack-installed marker, same contract session-context.mjs's
 * designSetupNudge uses) — unlike the build-mode gates,
 * this is NOT scoped to `.argo/build-mode.json`: a Figma write matters
 * whether or not a gated build is running, so it arms in every session type
 * a design pack is installed in.
 *
 * Detects write-shaped calls cheaply: presence of the `use_figma` tool call
 * at all is enough (false positives on read-only scripts are acceptable —
 * the receipt requirement below is idempotent, a clean re-audit costs
 * nothing). Records a monotonically increasing write counter in
 * `.argo/design-guard.json`, and injects additionalContext reminding that a
 * clean tier-0 audit receipt is now owed for the touched components.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findArgoJson, setUpDesignApps } from '../config/argo-json.js'
import { resolveRepoRoot } from '../lib/repo-root.js'
import { bumpSessionWriteCount } from '../lib/session-guard.js'

const FIGMA_WRITE_TOOL = 'mcp__plugin_figma_figma__use_figma'

function readStdin(): Promise<string> {
  return new Promise((resolvePromise) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolvePromise(data))
  })
}

const raw = await readStdin().catch(() => '')
let hook: any
try {
  hook = JSON.parse(raw)
} catch {
  process.exit(0) // malformed stdin — inert
}

if (hook?.hook_event_name !== 'PostToolUse' || hook?.tool_name !== FIGMA_WRITE_TOOL) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoRoot = resolveRepoRoot(cwd)
const designApps = setUpDesignApps(findArgoJson(repoRoot)?.config)
if (designApps.length === 0) process.exit(0) // design pack not installed — inert

// Non-project-file exemption: the tier-0 audit gate covers the app's OWN Figma
// file (`figma.projectFileKey`). A `use_figma` call against a DIFFERENT file —
// reading the kit library to import a component, dumping kit variable keys for
// figma-sync — is not a project write and must not arm the project's audit-owed
// gate (that false positive forces a nonsensical project audit for a read of an
// unrelated file). Only skip when we can prove the target is non-project: at
// least one projectFileKey is configured AND the call's fileKey is a non-empty
// string that matches none of them. No configured key, or an absent fileKey →
// count as before (fail-safe: never silently stop gating a real project write).
function projectFileKeysOf(apps: { block: Record<string, unknown> }[]): Set<string> {
  const keys = new Set<string>()
  for (const { block } of apps) {
    const figma = block?.figma as { projectFileKey?: unknown } | undefined
    if (typeof figma?.projectFileKey === 'string' && figma.projectFileKey.length > 0) keys.add(figma.projectFileKey)
  }
  return keys
}
const projectFileKeys = projectFileKeysOf(designApps)
const writeFileKey = typeof hook?.tool_input?.fileKey === 'string' ? hook.tool_input.fileKey : ''
if (projectFileKeys.size > 0 && writeFileKey.length > 0 && !projectFileKeys.has(writeFileKey)) process.exit(0)

// LEGACY wireframe-write exemption (the figma-wireframe skill is deleted; the
// tag is kept for backward compat on projects with pre-existing W## pages):
// wireframe pages are tier-0 exempt in the audit (isWireframePageName), so
// counting a wireframe write would force a guaranteed-empty end-of-session
// audit. A write tagged `figma-wireframe` in the use_figma `skillNames`
// argument stays fully inert (no counter bump, no audit-owed nudge).
// Missing/other skillNames → normal counting.
function skillNamesFrom(toolInput: any): string[] {
  const raw = toolInput?.skillNames
  if (Array.isArray(raw)) return raw.map((s) => String(s))
  if (typeof raw === 'string') return raw.split(',')
  return []
}
if (skillNamesFrom(hook?.tool_input).some((s) => s.trim() === 'figma-wireframe')) process.exit(0)

// Read-only exemption (mirrors the wireframe exemption immediately above): a
// pure-introspection use_figma call (getNodeById + property reads, no
// mutation) tags itself 'figma-read-only' in skillNames so it doesn't arm
// the audit-owed gate. Same trust model as the wireframe tag — a mistagged
// write still gets caught by the NEXT real write's count.
if (skillNamesFrom(hook?.tool_input).some((s) => s.trim() === 'figma-read-only')) process.exit(0)

// Per-session-design-gate.md: when the write is attributed to a session,
// record it in that session's OWN file (`.argo/design-guard/<sid>.json`) and
// touch nothing shared — this is what lets a concurrent design session write
// the same file without a lost-update race or a receipt clobber. Only the
// legacy sessionless path still mutates the shared `.argo/design-guard.json`
// (kept so the stop gate's legacy fallback keeps gating those writes).
const sessionId = typeof hook?.session_id === 'string' && hook.session_id.length > 0 ? hook.session_id : null
if (sessionId) {
  bumpSessionWriteCount(repoRoot, sessionId, Date.now())
} else {
  const statePath = join(repoRoot, '.argo', 'design-guard.json')
  let state: any = { writeCount: 0, sessions: {} }
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'))
    } catch {
      state = { writeCount: 0, sessions: {} } // corrupt state — recover rather than crash
    }
  }
  const sessions = typeof state.sessions === 'object' && state.sessions !== null ? state.sessions : {}
  const writeCount = (typeof state.writeCount === 'number' ? state.writeCount : 0) + 1
  mkdirSync(join(repoRoot, '.argo'), { recursive: true })
  writeFileSync(statePath, JSON.stringify({ writeCount, lastWriteAt: Date.now(), sessions }))
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        'Design guard: a Figma write just happened. A clean tier-0 audit receipt ' +
        '(design/audit-receipt.json, violationCount 0, matching this write count) is now owed ' +
        'for the touched components before this work can be declared done — run /argo:figma-audit.'
    }
  })
)
process.exit(0)
