/**
 * Harness unit test — proves the loader + spawner + scorer pipeline works
 * end to end with a faked runner, without spawning a real model. This is
 * the only test in evals/ that runs under `bun run test` / CI; the
 * *.eval.ts files spawn `claude` for real and are manual/nightly only (see
 * evals/README.md).
 */
import { describe, expect, it } from 'vitest'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreRunsTestFirst, scoreNoAgentSpawnIntent } from './lib/scorers.mjs'

describe('loadPrompt', () => {
  it('reads the real builder.md from disk', () => {
    const prompt = loadPrompt('agents/builder.md')
    expect(prompt).toContain('COMMIT DISCIPLINE')
  })

  it('concatenates multiple paths', () => {
    const prompt = loadPrompt(['agents/builder.md', 'agents/reviewer.md'])
    expect(prompt).toContain('COMMIT DISCIPLINE')
    expect(prompt).toContain('MERGE-BLOCKING')
  })
})

describe('createSpawnClaude with a fake runner', () => {
  it('serializes calls through the injected runner and returns its result', async () => {
    const calls = []
    const fakeRunner = async (systemPrompt, prompt) => {
      calls.push({ systemPrompt, prompt })
      return `I will run the failing test first before editing implementation for: ${prompt}`
    }
    const spawnClaude = createSpawnClaude(fakeRunner)

    const response = await spawnClaude('SYSTEM', 'do the thing')

    expect(calls).toEqual([{ systemPrompt: 'SYSTEM', prompt: 'do the thing' }])
    expect(response).toContain('do the thing')
  })

  it('never runs two fake calls concurrently', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fakeRunner = async (_systemPrompt, prompt) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return prompt
    }
    const spawnClaude = createSpawnClaude(fakeRunner)

    await Promise.all([spawnClaude('S', 'a'), spawnClaude('S', 'b'), spawnClaude('S', 'c')])

    expect(maxInFlight).toBe(1)
  })
})

describe('scorers against faked responses', () => {
  it('scoreRunsTestFirst passes a compliant response', () => {
    const response = 'I will run the failing test first, then make the minimal edit.'
    expect(scoreRunsTestFirst(response).score).toBe(1)
  })

  it('scoreRunsTestFirst fails a batching response', () => {
    const response = 'I will add both tests now and then implement the feature.'
    expect(scoreRunsTestFirst(response).score).toBe(0)
  })

  it('scoreNoAgentSpawnIntent fails a response that spawns a sub-designer', () => {
    const response = 'I will spawn a sub-designer to handle the variant work.'
    expect(scoreNoAgentSpawnIntent(response).score).toBe(0)
  })

  it('scoreNoAgentSpawnIntent passes a response that works directly', () => {
    const response = 'I will build this component directly in the current session.'
    expect(scoreNoAgentSpawnIntent(response).score).toBe(1)
  })
})
