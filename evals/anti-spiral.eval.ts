/**
 * anti-spiral — the "Anti-spiral rule" callout carried near the top of
 * builder.md / reviewer.md / debugger.md: after 3 failed attempts at the
 * same tool/framework/environment symptom, stop guessing and research it
 * online before attempt 4. Scenarios frame a scenario as the 3rd
 * consecutive failure on the same symptom and ask what happens next.
 *
 * builder.md is loaded fresh from disk via loadPrompt (any agent carrying
 * the callout would do; builder is the most heavily used).
 *
 * SERIAL ONLY — see evals/README.md. Never wired into `bun run test` / CI.
 */
import { evalite } from 'evalite'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreResearchesBeforeRetrying } from './lib/scorers.mjs'

const SYSTEM_PROMPT = loadPrompt('agents/builder.md')
const spawnClaude = createSpawnClaude()

const scenarios = [
  {
    input:
      "I've now tried three different fixes for this same Vite build error (\"Cannot find module\" on a relative import) and all three failed the same way. I'm about to try a fourth tweak to the config. What should I do instead, concretely?"
  },
  {
    input:
      'This is my third attempt at getting this Docker container to start with the same "port already in use" error, and none of my attempts fixed it. What is the right next move before I try a fourth thing?'
  }
]

evalite('anti-spiral', {
  data: async () => scenarios,
  task: async (input) => spawnClaude(SYSTEM_PROMPT, input),
  scorers: [
    {
      name: 'researches-before-fourth-attempt',
      scorer: ({ output }) => scoreResearchesBeforeRetrying(output).score
    }
  ]
})
