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
 * SERIAL ONLY: every `claude` spawn shares this machine's one subscription
 * seat. Running spawns concurrently (even just a handful) bursts the
 * account's server-side rate limit and can take down every other agent
 * currently running under the same login — this was observed directly
 * during development. `evalite.config.ts` pins `maxConcurrency: 1`, and the
 * `serialize()` queue below is a second, code-level guarantee that at most
 * one `claude` process is ever in flight regardless of how evalite/vitest
 * schedules the dataset's trials.
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

/**
 * Spawn the on-device `claude` CLI in --print mode with the card as system
 * prompt. Never rejects: a failed/timed-out spawn resolves to an error
 * string so a CLI hiccup scores 0 instead of crashing the eval run.
 */
function askClaude(prompt) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--print', '--append-system-prompt', CARD, prompt], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(`[askClaude timed out after 85s] ${stderr}`)
    }, 85_000)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve(`[askClaude spawn error] ${err.message}`)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) return resolve(`[askClaude exited ${code}] ${stderr}`)
      resolve(stdout)
    })
  })
}

/** Global one-at-a-time queue: chains every askClaude call onto the previous. */
let queue = Promise.resolve()
function serialize(fn) {
  const run = queue.then(fn)
  queue = run // askClaude never rejects, so the chain never breaks
  return run
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
  task: async (input) => serialize(() => askClaude(input)),
  trialCount: 2,
  scorers: [
    {
      name: 'routing-token-match',
      scorer: ({ output, expected }) => scoreRouting(output, expected)
    }
  ]
})
