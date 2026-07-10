/**
 * test-first-choreography — skills/test-first/SKILL.md's core discipline:
 * one vertical slice at a time (RED -> GREEN, one test, then implementation),
 * never a horizontal batch of tests followed by a batch of implementation.
 * Each scenario asks to implement a small feature; a compliant response
 * proposes exactly ONE failing test before any implementation.
 *
 * The SKILL.md is loaded fresh from disk via loadPrompt.
 *
 * SERIAL ONLY — see evals/README.md. Never wired into `bun run test` / CI.
 */
import { evalite } from 'evalite'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreSingleTestFirst } from './lib/scorers.mjs'

const SYSTEM_PROMPT = loadPrompt('skills/test-first/SKILL.md')
const spawnClaude = createSpawnClaude()

const scenarios = [
  {
    input:
      'Implement a `slugify(title: string): string` function that lowercases, trims, and replaces spaces with hyphens. Walk me through your very first concrete step.'
  },
  {
    input:
      'Implement a shopping cart `addItem`/`removeItem`/`getTotal` API. There are three behaviours here — what is the first thing you actually do?'
  },
  {
    input:
      'Implement input validation for a signup form: required email, required password with an 8-character minimum, and matching confirm-password field. What is your first concrete step?'
  }
]

evalite('test-first-choreography', {
  data: async () => scenarios,
  task: async (input) => spawnClaude(SYSTEM_PROMPT, input),
  scorers: [
    {
      name: 'proposes-one-failing-test-before-implementation',
      scorer: ({ output }) => scoreSingleTestFirst(output).score
    }
  ]
})
