import { describe, expect, it } from 'vitest'
import { registerWorkflow, type ArgoConfig, type WorkflowInstance } from '@argohq/core'
import { runPermissionHook } from './hook.js'

function baseConfig(overrides: Partial<ArgoConfig> = {}): ArgoConfig {
  return { packs: {}, noWorkflow: 'allow', ...overrides }
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

describe('runPermissionHook', () => {
  it('denies a protected-path write even when the active stage allows file-edit', () => {
    const workflowName = uniqueName('screen-create')
    registerWorkflow({
      name: workflowName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: WorkflowInstance = {
      workflow: workflowName,
      target: 'some-screen',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook(
      { tool_name: 'Edit', tool_input: { file_path: '.argo/config.json' } },
      baseConfig(),
      () => instance
    )

    expect(decision.decision).toBe('deny')
    if (decision.decision === 'deny') {
      expect(decision.reason).toMatch(/protected/i)
    }
  })

  it('blocks a file-edit and coaches to start a workflow when noWorkflow is deny-edits and none is active', () => {
    const decision = runPermissionHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noWorkflow: 'deny-edits' }),
      () => null
    )

    expect(decision.decision).toBe('deny')
    if (decision.decision === 'deny') {
      expect(decision.reason).toMatch(/workflow/i)
      expect(decision.reason).toMatch(/start/i)
    }
  })

  it('passes everything when noWorkflow is allow and none is active', () => {
    const editDecision = runPermissionHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noWorkflow: 'allow' }),
      () => null
    )
    const bashDecision = runPermissionHook(
      { tool_name: 'Bash', tool_input: { command: 'git commit --amend' } },
      baseConfig({ noWorkflow: 'allow' }),
      () => null
    )

    expect(editDecision.decision).toBe('allow')
    expect(bashDecision.decision).toBe('allow')
  })

  it('denies a git-history-mutation action kind not present in the active stage allows', () => {
    const workflowName = uniqueName('build-slice')
    registerWorkflow({
      name: workflowName,
      stages: [{ name: 'tests-stay-green', allows: ['test-run'] }]
    })
    const instance: WorkflowInstance = {
      workflow: workflowName,
      target: 'some-slice',
      stage: 'tests-stay-green',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook(
      { tool_name: 'Bash', tool_input: { command: 'git commit --amend' } },
      baseConfig(),
      () => instance
    )

    expect(decision.decision).toBe('deny')
    if (decision.decision === 'deny') {
      expect(decision.reason).toMatch(/tests-stay-green/)
      expect(decision.reason).toMatch(/git-history-mutation/)
    }
  })

  it('allows an action kind present in the active stage allows', () => {
    const workflowName = uniqueName('build-slice-ok')
    registerWorkflow({
      name: workflowName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: WorkflowInstance = {
      workflow: workflowName,
      target: 'some-slice',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook(
      { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig(),
      () => instance
    )

    expect(decision.decision).toBe('allow')
  })

  it('fails closed when the active instance points at an unregistered workflow', () => {
    const instance: WorkflowInstance = {
      workflow: 'no-such-workflow-' + Math.random(),
      target: 'x',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook({ tool_name: 'Read', tool_input: { file_path: 'src/foo.ts' } }, baseConfig(), () => instance)

    expect(decision.decision).toBe('deny')
  })
})
