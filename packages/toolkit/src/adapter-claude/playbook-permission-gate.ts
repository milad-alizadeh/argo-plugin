#!/usr/bin/env node
/**
 * Playbook permission gate — the generic PreToolUse hook body (design doc /
 * `.argo/plans/playbook-engine-phase1.md`, Slice 8 step 23) wired into kit's
 * real hook chain. Unlike `trust-gate.ts`/`red-proof-gate.ts` (hardwired to
 * `git commit` on Bash), this hook runs on EVERY tool call — matcher `*` in
 * `hooks/hooks.json` — because `@argohq/claude-adapter-plugin`'s `runPermissionHook`
 * needs to see Bash, Edit/Write, and Figma calls alike to enforce a playbook
 * stage's `allows` list and the unconditional protected-path floor.
 *
 * Shape mirrors `trust-gate.ts`/`red-proof-gate.ts`: stdin-JSON hook envelope
 * in, `process.exit(0|2)` out, deny reason on stderr. Repo-root resolution
 * reuses `resolveRepoRoot` (`../lib/repo-root.js`) — same helper design-guard's
 * hooks already share — rather than re-deriving it, since this hook has no
 * Bash-command-string to parse (`effectiveRepoDir`'s `-C`/`--git-dir` handling
 * is specific to git commit commands and doesn't apply to a generic tool
 * call): the hook's own reported `cwd` is all there is to resolve from.
 *
 * "Active instance" mechanism: `@argohq/toolkit/core`'s state store has no built-in
 * concept of "the" active playbook for a project (an instance is addressed by
 * `deriveInstanceKey(playbook, target)`, and a generic tool call carries
 * neither). `playbook-start`/`playbook-adopt` now write a project-scoped
 * pointer file (`setActiveInstance`) recording the last-started/adopted
 * instance's key; this hook reads it back via `getActiveInstance` and passes
 * that as the `ActiveInstanceReader` `runPermissionHook` expects. No caching
 * here — each invocation is a fresh process, so "session-cached" (the design
 * doc's phrasing) reduces to "read fresh once per hook call," which is what a
 * plain disk read already gives us.
 */
import { runPermissionHook, type HookInput } from './index.js'
import { getActiveInstance, readConfig } from '../core/index.js'
import { resolveRepoRoot } from '../lib/repo-root.js'
// Side-effectful: registers every pack playbook spec via the single
// composition-root loader (never imports `packs/design` directly — the
// adapter layer may not import packs, see templates/rules/file-structure.md).
// Without this the hook cannot resolve an active run's spec and (before
// 0.56.3) fail-closed denied EVERY tool call in the session — including the
// tools needed to repair it.
import '../register-installed-packs.js'

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
  // Malformed stdin can't identify a cwd or tool call to gate — inert, same
  // fail-open-on-unparseable convention as trust-gate/red-proof-gate: this
  // hook fires on EVERY tool call in EVERY host project, so a glitch here
  // must never become an all-blocking plugin.
  process.exit(0)
}

const toolName = hook?.tool_name
const rawCwd = hook?.cwd
if (typeof toolName !== 'string' || typeof rawCwd !== 'string' || rawCwd.length === 0) {
  process.exit(0)
}

const cwd = resolveRepoRoot(rawCwd)

const input: HookInput = {
  tool_name: toolName,
  tool_input: hook?.tool_input,
  cwd
}

// `ARGO_STATE_ROOT` overrides the state store's root directory (normally
// `~/.argo/state`) — test-only seam so this hook's tests never touch a real
// home directory, matching the pattern of injecting `stateRoot` everywhere
// else `@argohq/toolkit/core`'s state store is exercised in tests.
const stateRoot = process.env.ARGO_STATE_ROOT
const config = readConfig(cwd)
// Session affinity: a run gates ONLY the session executing it. The pointer
// records the owning sessionId (playbook start/claim); every other session's
// tool calls see "no active instance" and pass ungated (2026-07-10: a
// project-wide pointer gated the supervisor and parallel agents alike).
const callerSessionId = typeof hook?.session_id === 'string' && hook.session_id.length > 0 ? hook.session_id : null
// A falsy caller session_id must never resolve an owned pointer's instance:
// `getActiveInstance`'s own affinity filter only rejects a MISMATCHED
// non-empty session id, so a missing/falsy caller id would otherwise fall
// through and see the owner's instance again — collapsing back to the
// project-wide gating the 2026-07-10 deadlock fix eliminated (release-
// gating #2). Treat "no caller session id" as "no active instance for this
// caller" outright, without ever consulting the pointer.
const decision = runPermissionHook(input, config, () =>
  callerSessionId === null ? null : getActiveInstance({ cwd, stateRoot, forSessionId: callerSessionId })
)

if (decision.decision === 'allow') {
  if (decision.advisory !== undefined) {
    // Coach mode: the edit goes through, but the advisory rides back to the
    // model as PreToolUse additionalContext (plain stdout on exit 0 is only
    // shown in transcript mode, never to the model — JSON output is the one
    // channel that reaches it on an allow).
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: decision.advisory,
          additionalContext: decision.advisory
        }
      }) + '\n'
    )
  }
  process.exit(0)
}

process.stderr.write(`Playbook permission gate: BLOCKED — ${decision.reason}\n`)
process.exit(2)
