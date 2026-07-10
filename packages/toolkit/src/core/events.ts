/**
 * Playbook lifecycle event vocabulary. Lives in core because the engine's
 * own verbs emit these; the host app must never import core directly for
 * contract strings.
 *
 * Events are returned, not persisted: the instance state file remains the
 * durable record; events are the CLI-call-scoped delta a host app feeds its
 * run feed from.
 */
export const PLAYBOOK_LIFECYCLE_EVENTS = {
  PLAYBOOK_STARTED: 'playbook_started',
  PLAYBOOK_FINISHED: 'playbook_finished',
  STAGE_STARTED: 'stage_started',
  STAGE_FINISHED: 'stage_finished'
} as const
export type PlaybookLifecycleEvent = (typeof PLAYBOOK_LIFECYCLE_EVENTS)[keyof typeof PLAYBOOK_LIFECYCLE_EVENTS]

export interface PlaybookLifecycleEventRecord {
  event: PlaybookLifecycleEvent
  playbook: string
  /** Present on stage_started / stage_finished; absent on playbook-level events. */
  stage?: string
  /** ISO timestamp. */
  at: string
}
