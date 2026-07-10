/**
 * Pure predicates behind the plugin-safety `argo-hook` routes
 * (bash-safety-guards, block-lockfile-edit, block-designer-spawn,
 * session-context) — re-exported for direct unit testing. The route ->
 * module-file dispatch table those CLI routes wire into lives in
 * `bin/argo.js`'s `HOOK_CHAINS` (each module is also a standalone script,
 * spawned as its own process per the existing gate-chain convention shared
 * with packs/code's red-proof-gate/trust-gate).
 */
export { dangerousGitViolation, pipeToShellViolation, bashSourceWriteViolation } from './bash-safety-guards.js'
export { lockfileViolation } from './block-lockfile-edit.js'
export { isDesignerTranscript } from './block-designer-spawn.js'
export { setupNudge } from './session-context.js'
