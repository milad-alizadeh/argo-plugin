// Stable host-app contract: string constants shared with the toolkit. Each
// value is asserted verbatim in a contract-freeze test, so changing one is a
// breaking change and must be versioned deliberately, never drive-by renamed.

/** Run/instance `status` values, exactly as the core playbook engine writes
 * them. The host app's Parked/Abandoned run states are host-side derivations,
 * not engine statuses. */
export const RUN_STATES = {
  IN_PROGRESS: 'in-progress',
  STUCK: 'stuck',
  DONE: 'done'
} as const
export type RunState = (typeof RUN_STATES)[keyof typeof RUN_STATES]

/** Playbook lifecycle event names for the host app's run feed, re-exported
 * from the core engine that emits them. A failing verdict emits none;
 * retry/stuck rides `status` instead. Adoption does not emit yet. */
export {
  PLAYBOOK_LIFECYCLE_EVENTS,
  type PlaybookLifecycleEvent,
  type PlaybookLifecycleEventRecord
} from '../core/events.js'

/** Claude Code tool names the host app's hook router matches on for fan-out /
 * child-session tooling, verbatim from PreToolUse/PostToolUse hook envelopes. */
export const TOOL_NAMES = {
  AGENT: 'Agent',
  TASK: 'Task',
  WORKFLOW: 'Workflow'
} as const
export type FanOutToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES]

/** `tool_response.status` lifecycle strings for async fan-out tools: a
 * Workflow/Agent launch resolves its own tool call at LAUNCH with
 * `async_launched`, not at finish; synchronous completion reports `completed`. */
export const LIFECYCLE_STATUSES = {
  ASYNC_LAUNCHED: 'async_launched',
  COMPLETED: 'completed'
} as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[keyof typeof LIFECYCLE_STATUSES]
