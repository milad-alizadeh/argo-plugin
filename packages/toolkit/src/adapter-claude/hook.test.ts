import { describe, expect, it } from 'vitest'
import { registerPlaybook, type ArgoConfig, type PlaybookInstance } from '../core/index.js'
import { runPermissionHook } from './hook.js'

function baseConfig(overrides: Partial<ArgoConfig> = {}): ArgoConfig {
  return { packs: {}, noPlaybook: 'allow', ...overrides }
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

describe('runPermissionHook', () => {
  it('denies a protected-path write even when the active stage allows file-edit', () => {
    const playbookName = uniqueName('screen-create')
    registerPlaybook({
      name: playbookName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: PlaybookInstance = {
      playbook: playbookName,
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

  it('blocks a file-edit and coaches to start a playbook when noPlaybook is deny-edits and none is active', () => {
    const decision = runPermissionHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noPlaybook: 'deny-edits' }),
      () => null
    )

    expect(decision.decision).toBe('deny')
    if (decision.decision === 'deny') {
      expect(decision.reason).toMatch(/playbook/i)
      expect(decision.reason).toMatch(/start/i)
    }
  })

  it('allows a file-edit but injects advisory coaching when noPlaybook is coach and none is active', () => {
    const decision = runPermissionHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noPlaybook: 'coach' }),
      () => null
    )

    expect(decision.decision).toBe('allow')
    if (decision.decision === 'allow') {
      expect(decision.advisory).toMatch(/playbook/i)
      expect(decision.advisory).toMatch(/argo playbook start/)
    }
  })

  it('allows non-edit tool calls silently (no advisory) when noPlaybook is coach and none is active', () => {
    const decision = runPermissionHook(
      { tool_name: 'Read', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noPlaybook: 'coach' }),
      () => null
    )

    expect(decision.decision).toBe('allow')
    if (decision.decision === 'allow') {
      expect(decision.advisory).toBeUndefined()
    }
  })

  it('coach never advises when a run IS active — the stage allows list decides instead', () => {
    const playbookName = uniqueName('coach-active')
    registerPlaybook({
      name: playbookName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: PlaybookInstance = {
      playbook: playbookName,
      target: 't',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook(
      { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noPlaybook: 'coach' }),
      () => instance
    )

    expect(decision.decision).toBe('allow')
    if (decision.decision === 'allow') {
      expect(decision.advisory).toBeUndefined()
    }
  })

  it('passes everything when noPlaybook is allow and none is active', () => {
    const editDecision = runPermissionHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } },
      baseConfig({ noPlaybook: 'allow' }),
      () => null
    )
    const bashDecision = runPermissionHook(
      { tool_name: 'Bash', tool_input: { command: 'git commit --amend' } },
      baseConfig({ noPlaybook: 'allow' }),
      () => null
    )

    expect(editDecision.decision).toBe('allow')
    expect(bashDecision.decision).toBe('allow')
  })

  it('denies a git-history-mutation action kind not present in the active stage allows', () => {
    const playbookName = uniqueName('build-slice')
    registerPlaybook({
      name: playbookName,
      stages: [{ name: 'tests-stay-green', allows: ['test-run'] }]
    })
    const instance: PlaybookInstance = {
      playbook: playbookName,
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
    const playbookName = uniqueName('build-slice-ok')
    registerPlaybook({
      name: playbookName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: PlaybookInstance = {
      playbook: playbookName,
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

  it('passes an UNCLASSIFIED tool call through under an active stage (classifier pass-through invariant)', () => {
    const playbookName = uniqueName('unclassified-passthrough')
    registerPlaybook({
      name: playbookName,
      stages: [{ name: 'build', allows: ['file-edit'] }]
    })
    const instance: PlaybookInstance = {
      playbook: playbookName,
      target: 't',
      stage: 'build',
      status: 'in-progress',
      attempts: [],
      history: []
    }

    const decision = runPermissionHook(
      { tool_name: 'Bash', tool_input: { command: 'ls -la' } },
      baseConfig(),
      () => instance
    )

    expect(decision.decision).toBe('allow')
  })

  it('fails closed when the active instance points at an unregistered playbook', () => {
    const instance: PlaybookInstance = {
      playbook: 'no-such-playbook-' + Math.random(),
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
