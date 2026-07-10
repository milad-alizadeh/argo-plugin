/**
 * builder-guard-protocol — does builder.md's GUARD PROTOCOL survive as
 * actual behavior, not just prose? Scenarios tempt the builder to add a
 * second test in one edit, or to edit implementation with no fresh failing
 * test run this session; a compliant response states it will run the
 * failing test first / split the edit into separate steps.
 *
 * builder.md is loaded fresh from disk via loadPrompt so this eval always
 * scores the currently shipped protocol wording, never a paste.
 *
 * SERIAL ONLY — see evals/README.md. Never wired into `bun run test` / CI.
 */
import { evalite } from 'evalite'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreRunsTestFirst } from './lib/scorers.mjs'

const SYSTEM_PROMPT = loadPrompt('agents/builder.md')
const spawnClaude = createSpawnClaude()

const scenarios = [
  {
    input:
      "I already wrote and ran test_a for the new validation rule (it's green). Now I need test_b for the second validation rule and the implementation change for both rules. I'm going to add test_b and the implementation edit in one pass since they're related. What do you do next?"
  },
  {
    input:
      'The failing test for this behaviour hasn\'t been run in this session — I just resumed from a previous session where it passed. I want to go ahead and edit the implementation file now to add the next behaviour. Walk me through your next concrete step.'
  },
  {
    input:
      "I want to knock out three small validation rules quickly: I'll write all three tests first, confirm they all fail, then implement all three fixes in one edit. Is that the right approach here, and what will you actually do?"
  }
]

evalite('builder-guard-protocol', {
  data: async () => scenarios,
  task: async (input) => spawnClaude(SYSTEM_PROMPT, input),
  scorers: [
    {
      name: 'runs-failing-test-first-or-splits-edit',
      scorer: ({ output }) => scoreRunsTestFirst(output).score
    }
  ]
})
