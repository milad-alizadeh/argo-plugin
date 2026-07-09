import { describe, expect, it } from 'vitest'
import { defineWorkflow, getWorkflow, registerWorkflow } from './spec.js'

describe('defineWorkflow', () => {
  it('round-trips a valid spec unchanged', () => {
    const spec = {
      name: 'screen-create',
      stages: [
        {
          name: 'brief',
          allows: ['file-edit', 'figma-read'],
          produces: ['design/briefs/<key>.md'],
          gate: 'brief-check',
          session: 'fresh' as const
        },
        {
          name: 'build',
          requires: ['brief'],
          allows: ['figma-write', 'figma-read'],
          produces: ['figma:<key>', 'manifests/<key>.json'],
          gate: 'design-rules-check',
          skill: 'design-screen',
          session: 'fresh' as const,
          retries: 2
        },
        {
          name: 'review',
          requires: ['build'],
          allows: ['figma-read'],
          gate: 'fresh-eyes-review',
          maxRounds: 1
        }
      ]
    }

    const result = defineWorkflow(spec)

    expect(result).toBe(spec)
    expect(result).toEqual(spec)
  })

  it('throws when a stage is missing the required `allows` field', () => {
    expect(() =>
      defineWorkflow({
        name: 'broken',
        stages: [{ name: 'stage-one' } as never]
      })
    ).toThrow()
  })

  it('throws when the workflow is missing the required `name` field', () => {
    expect(() =>
      defineWorkflow({
        stages: [{ name: 'stage-one', allows: ['file-edit'] }]
      } as never)
    ).toThrow()
  })

  it('throws when `stages` is empty', () => {
    expect(() => defineWorkflow({ name: 'empty', stages: [] })).toThrow()
  })
})

describe('registerWorkflow / getWorkflow', () => {
  it('registers two workflows and fetches each by name', () => {
    const a = defineWorkflow({ name: `workflow-a-${Math.random()}`, stages: [{ name: 's', allows: ['file-edit'] }] })
    const b = defineWorkflow({ name: `workflow-b-${Math.random()}`, stages: [{ name: 's', allows: ['file-edit'] }] })

    registerWorkflow(a)
    registerWorkflow(b)

    expect(getWorkflow(a.name)).toBe(a)
    expect(getWorkflow(b.name)).toBe(b)
  })

  it('returns undefined for an unregistered name', () => {
    expect(getWorkflow(`nonexistent-${Math.random()}`)).toBeUndefined()
  })

  it('throws on duplicate-name registration', () => {
    const name = `workflow-dup-${Math.random()}`
    registerWorkflow(defineWorkflow({ name, stages: [{ name: 's', allows: ['file-edit'] }] }))

    expect(() =>
      registerWorkflow(defineWorkflow({ name, stages: [{ name: 's', allows: ['file-edit'] }] }))
    ).toThrow(/already registered/)
  })
})
