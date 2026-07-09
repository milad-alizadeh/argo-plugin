import { describe, expect, it } from 'vitest'
import type { Attempt, GateVerdict } from '../core/index.js'
import { spawnFresh, spawnRetry, spawnWarm, type SessionApi, type SessionHandle, type SpawnPayload, type WarmUnitPayload } from './session.js'

function fakeApi(): { api: SessionApi; spawnCalls: SpawnPayload[]; sendCalls: Array<{ handle: SessionHandle; payload: WarmUnitPayload }> } {
  const spawnCalls: SpawnPayload[] = []
  const sendCalls: Array<{ handle: SessionHandle; payload: WarmUnitPayload }> = []
  let counter = 0
  const api: SessionApi = {
    async spawn(payload) {
      spawnCalls.push(payload)
      counter += 1
      return { id: `session-${counter}` }
    },
    async send(handle, payload) {
      sendCalls.push({ handle, payload })
      return handle
    }
  }
  return { api, spawnCalls, sendCalls }
}

describe('spawnFresh', () => {
  it('sends only requires + skill + frame — nothing outside requires leaks in', async () => {
    const { api, spawnCalls } = fakeApi()

    await spawnFresh(api, { requires: { brief: 'brief-uri' }, skill: 'design-screen', frame: 'Build the login screen.' })

    expect(spawnCalls).toHaveLength(1)
    const payload = spawnCalls[0]
    expect(payload.kind).toBe('fresh')
    expect(Object.keys(payload).sort()).toEqual(['frame', 'kind', 'requires', 'skill'])
    expect(payload.requires).toEqual({ brief: 'brief-uri' })
    // No transcript-shaped or history-shaped field anywhere in the payload.
    expect('transcript' in payload).toBe(false)
    expect('history' in payload).toBe(false)
    expect('attempts' in payload).toBe(false)
  })
})

describe('spawnRetry', () => {
  it('includes attempts[] and the verdict but never a transcript field', async () => {
    const { api, spawnCalls } = fakeApi()
    const verdict: GateVerdict = { passed: false, findings: [{ message: 'missing alt text' }], evidence: ['shot.png'] }
    const attempts: Attempt[] = [{ round: 1, gate: 'design-rules-check', findings: [{ message: 'bad contrast' }], whatWasTried: 'raised contrast' }]

    await spawnRetry(api, { requires: { brief: 'brief-uri' }, skill: 'design-screen', frame: 'Fix the findings.', verdict, attempts })

    expect(spawnCalls).toHaveLength(1)
    const payload = spawnCalls[0]
    expect(payload.kind).toBe('retry')
    if (payload.kind === 'retry') {
      expect(payload.attempts).toEqual(attempts)
      expect(payload.verdict).toEqual(verdict)
    }
    expect('transcript' in payload).toBe(false)
    expect('transcriptPath' in payload).toBe(false)
    expect('messages' in payload).toBe(false)
  })
})

describe('spawnWarm', () => {
  it('spawns fresh for the first unit, then reuses the returned handle for subsequent units', async () => {
    const { api, spawnCalls, sendCalls } = fakeApi()

    const handle1 = await spawnWarm(api, null, { unit: 'section-1', requires: { brief: 'brief-uri' }, skill: 'design-screen', frame: 'Build section 1.' })
    expect(spawnCalls).toHaveLength(1)
    expect(sendCalls).toHaveLength(0)

    const handle2 = await spawnWarm(api, handle1, { unit: 'section-2', requires: { brief: 'brief-uri' }, skill: 'design-screen', frame: 'Build section 2.' })
    expect(spawnCalls).toHaveLength(1) // no second spawn
    expect(sendCalls).toHaveLength(1)
    expect(sendCalls[0].handle).toEqual(handle1)
    expect(sendCalls[0].payload.unit).toBe('section-2')
    expect(handle2).toEqual(handle1)
  })
})
