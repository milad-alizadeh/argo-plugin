/**
 * Stable host-app contract: the string constants the argo host app (argo-v2's
 * desktop cockpit, PRD `playbooks-and-runs.md`) shares with the toolkit.
 * Import via the `@argohq/toolkit/adapter-claude` subpath export.
 *
 * These are CONTRACT FREEZES — each value is asserted verbatim in
 * `contract.test.ts`; changing one is a breaking change for the host app and
 * must be versioned deliberately, never drive-by renamed.
 */

/**
 * Run/instance `status` values, exactly as `@argohq/core`'s playbook engine
 * writes them (`playbook-start.ts` / `playbook-advance.ts` / `playbook-adopt.ts`).
 * The host app's Parked/Abandoned run states are host-side derivations
 * (no attached session / archived record), not engine statuses.
 */
export const RUN_STATES = {
  IN_PROGRESS: 'in-progress',
  STUCK: 'stuck',
  DONE: 'done'
} as const
export type RunState = (typeof RUN_STATES)[keyof typeof RUN_STATES]

/**
 * Playbook lifecycle event names for the host app's run feed — re-exported
 * from `@argohq/core`'s `events.ts`, which owns them because the engine
 * itself emits them: `playbookStart` and `playbookAdvance` return an
 * `events` array of these transitions (start → playbook_started +
 * stage_started; passing advance → stage_finished + stage_started /
 * playbook_finished; a failing verdict emits none — retry/stuck rides
 * `status`). `playbookAdopt` does not emit yet (see
 * `.argo/plans/toolkit-contract-surfaces.md`).
 */
export {
  PLAYBOOK_LIFECYCLE_EVENTS,
  type PlaybookLifecycleEvent,
  type PlaybookLifecycleEventRecord
} from '../core/events.js'

/**
 * Claude Code tool names the host app's hook router matches on (fan-out /
 * child-session tooling). Verbatim `tool_name` values from PreToolUse /
 * PostToolUse hook envelopes.
 */
export const TOOL_NAMES = {
  AGENT: 'Agent',
  TASK: 'Task',
  WORKFLOW: 'Workflow'
} as const
export type FanOutToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES]

/**
 * `tool_response.status` lifecycle strings for async fan-out tools: a
 * Workflow/Agent launch resolves its own tool call at LAUNCH with
 * `async_launched` (not at finish); synchronous completion reports
 * `completed`.
 */
export const LIFECYCLE_STATUSES = {
  ASYNC_LAUNCHED: 'async_launched',
  COMPLETED: 'completed'
} as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[keyof typeof LIFECYCLE_STATUSES]
