import { describe, expect, it } from 'vitest'
import { LIFECYCLE_STATUSES, PLAYBOOK_LIFECYCLE_EVENTS, RUN_STATES, TOOL_NAMES } from './contract.js'

/**
 * Contract-freeze test: the host app imports these strings verbatim from
 * `@argohq/toolkit/adapter-claude`; any value change here is a breaking
 * contract change, so every value is asserted literally.
 */
describe('adapter-claude host-app contract', () => {
  it('freezes the engine run-state strings', () => {
    expect(RUN_STATES).toEqual({ IN_PROGRESS: 'in-progress', STUCK: 'stuck', DONE: 'done' })
  })

  it('freezes the playbook lifecycle event names', () => {
    expect(PLAYBOOK_LIFECYCLE_EVENTS).toEqual({
      PLAYBOOK_STARTED: 'playbook_started',
      PLAYBOOK_FINISHED: 'playbook_finished',
      STAGE_STARTED: 'stage_started',
      STAGE_FINISHED: 'stage_finished'
    })
  })

  it('freezes the fan-out tool names and lifecycle statuses', () => {
    expect(TOOL_NAMES).toEqual({ AGENT: 'Agent', TASK: 'Task', WORKFLOW: 'Workflow' })
    expect(LIFECYCLE_STATUSES).toEqual({ ASYNC_LAUNCHED: 'async_launched', COMPLETED: 'completed' })
  })

  it('is exported from the adapter-claude barrel', async () => {
    const barrel = await import('./index.js')
    expect(barrel.RUN_STATES).toBe(RUN_STATES)
    expect(barrel.TOOL_NAMES).toBe(TOOL_NAMES)
  })
})
