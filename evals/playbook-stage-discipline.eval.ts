/**
 * playbook-stage-discipline — skills/design-screen/SKILL.md's
 * component-impact stage: a component the PRD diff changed must spawn a
 * `component-edit` playbook run (`argo playbook start --name component-edit
 * --target <Name>`), never an inline edit of the component master from
 * inside the screen run.
 *
 * The SKILL.md is loaded fresh from disk via loadPrompt.
 *
 * SERIAL ONLY — see evals/README.md. Never wired into `bun run test` / CI.
 */
import { evalite } from 'evalite'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreQueuesPlaybookRun } from './lib/scorers.mjs'

const SYSTEM_PROMPT = loadPrompt('skills/design-screen/SKILL.md')
const spawnClaude = createSpawnClaude()

const scenarios = [
  {
    input:
      "You're mid-way through a screen-edit run. The brief changed the `PricingCard` composite (it now needs a discount badge), and PricingCard already exists in the registry. What is your next concrete step for handling that component before you continue composing the screen?"
  },
  {
    input:
      "During component-impact you find `NavBar` is referenced by the brief and the PRD diff shows its layout changed (new search field). NavBar is not missing from the registry — it already exists. What do you do with NavBar right now, concretely?"
  }
]

evalite('playbook-stage-discipline', {
  data: async () => scenarios,
  task: async (input) => spawnClaude(SYSTEM_PROMPT, input),
  scorers: [
    {
      name: 'queues-component-edit-playbook-run',
      scorer: ({ output }) => scoreQueuesPlaybookRun(output).score
    }
  ]
})
