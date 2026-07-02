/**
 * Card-routing eval — does the SessionStart way-of-working card (the CARD
 * const in hooks/session-context.mjs) actually make a session route work
 * to the right argo skill/agent?
 *
 * The card text is read from the real source via extractCard(), never
 * pasted, so this eval always scores current wording.
 *
 * Method: spawn `claude --print --append-system-prompt "<CARD>" "<scenario>"`
 * and score the response text deterministically (regex match on the
 * expected routing token) — no LLM judge. `--print` makes Claude PLAN the
 * response rather than execute a skill, so "mentions /argo:root-cause"
 * (etc.) is the routing signal we can observe here, not proof the skill
 * would actually run. N=2 trials per scenario (usage-bounded, not
 * statistically rigorous). Uses the on-device subscription-authed `claude`
 * CLI — never set ANTHROPIC_API_KEY for this eval, spawning `claude` picks
 * up local auth on its own.
 *
 * Run: `bun run eval` (or `bunx evalite run eval/card-routing.eval.ts`).
 * Never wired into `bun run test` / CI — usage-bounded, on-demand only.
 */
import { evalite } from 'evalite'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extractCard } from './lib/card.mjs'
import { scoreRouting } from './lib/scoreRouting.mjs'

const HOOK_PATH = fileURLToPath(new URL('../hooks/session-context.mjs', import.meta.url))
const CARD = extractCard(HOOK_PATH)

/** Spawn the on-device `claude` CLI in --print mode with the card as system prompt. */
function askClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--print', '--append-system-prompt', CARD, prompt], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr}`))
      resolve(stdout)
    })
  })
}

const scenarios = [
  {
    prompt: "My tests are failing with a weird error and I don't know why",
    expected: /\/argo:root-cause|argo:debugger/
  },
  {
    prompt: 'I have a plan doc ready at .claude/plans/foo.md — build it',
    expected: /\/argo:build-plan/
  },
  {
    prompt: 'I want to stress-test this design before writing code',
    expected: /\/argo:grill-me/
  },
  {
    prompt: 'Ship this finished branch',
    expected: /argo:integrator|finish-branch/
  }
]

evalite('card-routing', {
  data: async () => scenarios.map((s) => ({ input: s.prompt, expected: s.expected })),
  task: async (input) => askClaude(input),
  trialCount: 2,
  scorers: [
    {
      name: 'routing-token-match',
      scorer: ({ output, expected }) => scoreRouting(output, expected)
    }
  ]
})
