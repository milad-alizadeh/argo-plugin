import { describe, expect, it } from 'vitest'
import { definePlaybook, getPlaybook, registerPlaybook } from './spec.js'

describe('definePlaybook', () => {
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

    const result = definePlaybook(spec)

    expect(result).toBe(spec)
    expect(result).toEqual(spec)
  })

  it('throws when a stage is missing the required `allows` field', () => {
    expect(() =>
      definePlaybook({
        name: 'broken',
        stages: [{ name: 'stage-one' } as never]
      })
    ).toThrow()
  })

  it('throws when the playbook is missing the required `name` field', () => {
    expect(() =>
      definePlaybook({
        stages: [{ name: 'stage-one', allows: ['file-edit'] }]
      } as never)
    ).toThrow()
  })

  it('throws when `stages` is empty', () => {
    expect(() => definePlaybook({ name: 'empty', stages: [] })).toThrow()
  })
})

describe('registerPlaybook / getPlaybook', () => {
  it('registers two playbooks and fetches each by name', () => {
    const a = definePlaybook({ name: `playbook-a-${Math.random()}`, stages: [{ name: 's', allows: ['file-edit'] }] })
    const b = definePlaybook({ name: `playbook-b-${Math.random()}`, stages: [{ name: 's', allows: ['file-edit'] }] })

    registerPlaybook(a)
    registerPlaybook(b)

    expect(getPlaybook(a.name)).toBe(a)
    expect(getPlaybook(b.name)).toBe(b)
  })

  it('returns undefined for an unregistered name', () => {
    expect(getPlaybook(`nonexistent-${Math.random()}`)).toBeUndefined()
  })

  it('throws on duplicate-name registration', () => {
    const name = `playbook-dup-${Math.random()}`
    registerPlaybook(definePlaybook({ name, stages: [{ name: 's', allows: ['file-edit'] }] }))

    expect(() =>
      registerPlaybook(definePlaybook({ name, stages: [{ name: 's', allows: ['file-edit'] }] }))
    ).toThrow(/already registered/)
  })
})
