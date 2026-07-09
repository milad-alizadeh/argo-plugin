import { describe, expect, it } from 'vitest'
import { getGate, registerGate, type Gate, type GateVerdict } from './gate.js'

function makeGate(name: string): Gate {
  return {
    name,
    async check(): Promise<GateVerdict> {
      return { passed: true, findings: [], evidence: [] }
    }
  }
}

describe('gate registry', () => {
  it('registers two gates and fetches each by name', () => {
    const a = makeGate(`gate-a-${Math.random()}`)
    const b = makeGate(`gate-b-${Math.random()}`)

    registerGate(a)
    registerGate(b)

    expect(getGate(a.name)).toBe(a)
    expect(getGate(b.name)).toBe(b)
  })

  it('returns undefined for an unregistered name', () => {
    expect(getGate(`nonexistent-${Math.random()}`)).toBeUndefined()
  })

  it('throws on duplicate-name registration', () => {
    const name = `gate-dup-${Math.random()}`
    registerGate(makeGate(name))

    expect(() => registerGate(makeGate(name))).toThrow(/already registered/)
  })
})
