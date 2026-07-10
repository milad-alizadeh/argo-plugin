#!/usr/bin/env node
/**
 * Playbook permission gate: the generic PreToolUse hook body wired into
 * kit's real hook chain. Unlike the git-commit-only gates, this hook runs on
 * EVERY tool call, because it needs to see Bash, Edit/Write, and Figma calls
 * alike to enforce a playbook stage's `allows` list and the unconditional
 * protected-path floor.
 *
 * "Active instance" mechanism: the core state store has no built-in concept
 * of "the" active playbook for a project. `playbook-start`/`playbook-adopt`
 * write a project-scoped pointer file recording the last-started/adopted
 * instance's key; this hook reads it back and passes that as the
 * `ActiveInstanceReader` `runPermissionHook` expects. No caching here: each
 * invocation is a fresh process, so a plain disk read is already "read fresh
 * once per hook call."
 */
import { runPermissionHook, type HookInput } from './index.js'
import { getActiveInstance, readConfig } from '../core/index.js'
import { resolveRepoRoot } from '../lib/repo-root.js'
// Side-effectful: registers every pack playbook spec via the single
// composition-root loader; the adapter layer may not import packs directly.
// Without this the hook cannot resolve an active run's spec and, before a
// prior fix, fail-closed denied every tool call in the session, including
// the tools needed to repair it.
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
  // Malformed stdin can't identify a cwd or tool call to gate. Fail open: this
  // hook fires on every tool call in every host project, so a glitch here
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
// `~/.argo/state`): a test-only seam so this hook's tests never touch a real
// home directory.
const stateRoot = process.env.ARGO_STATE_ROOT
const config = readConfig(cwd)
// Session affinity: a run gates ONLY the session executing it. The pointer
// records the owning sessionId; every other session's tool calls see "no
// active instance" and pass ungated (2026-07-10: a project-wide pointer once
// gated the supervisor and parallel agents alike).
const callerSessionId = typeof hook?.session_id === 'string' && hook.session_id.length > 0 ? hook.session_id : null
// A falsy caller session_id must never resolve an owned pointer's instance:
// the affinity filter only rejects a MISMATCHED non-empty session id, so a
// missing/falsy caller id would otherwise fall through and see the owner's
// instance again. Treat "no caller session id" as "no active instance for
// this caller" outright, without ever consulting the pointer.
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
