/** Pure predicates behind the plugin-safety argo-hook routes, re-exported for direct unit testing. */
export { dangerousGitViolation, pipeToShellViolation, bashSourceWriteViolation } from './bash-safety-guards.js'
export { lockfileViolation } from './block-lockfile-edit.js'
export { isDesignerTranscript } from './block-designer-spawn.js'
export { setupNudge } from './session-context.js'
