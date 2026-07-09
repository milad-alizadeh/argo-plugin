/**
 * @argohq/claude-adapter-plugin root barrel. Slice 6: classifier + judge
 * implementation. Slice 7 adds the generic PreToolUse hook body (`hook.ts`)
 * and session spawn (`session.ts`). See
 * `.argo/plans/playbook-engine-phase1.md` for the full build order.
 * `contract.ts` carries the frozen host-app string contract.
 */
export * from './classifier.js'
export * from './contract.js'
export * from './judge-impl.js'
export * from './hook.js'
export * from './session.js'
