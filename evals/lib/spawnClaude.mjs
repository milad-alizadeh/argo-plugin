/**
 * spawnClaude — injectable runner seam for the prompt-surface evals.
 *
 * The real runner shells out to the on-device, subscription-authed `claude`
 * CLI in `--print` mode with the loaded prompt-surface material appended as
 * system prompt. Unit tests of the harness (evals/harness.test.mjs) inject a
 * fake runner instead, so CI never spawns a model.
 *
 * SERIAL ONLY: every `claude` spawn shares this machine's one subscription
 * seat. `createSpawnClaude` chains calls through a single queue so at most
 * one spawn is ever in flight, and `evalite.config.ts` additionally pins
 * `maxConcurrency: 1` as a second, code-level guarantee (see
 * eval/card-routing.eval.ts for the incident this defends against — running
 * spawns concurrently bursts the account's server-side rate limit).
 */
import { spawn } from 'node:child_process'

/**
 * Default runner: spawns `claude --print --append-system-prompt <systemPrompt> <prompt>`.
 * Never rejects — a failed/timed-out spawn resolves to an error string so a
 * CLI hiccup scores 0 instead of crashing the eval run.
 */
export function realRunner(systemPrompt, prompt, { timeoutMs = 85_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--print', '--append-system-prompt', systemPrompt, prompt], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(`[spawnClaude timed out after ${timeoutMs}ms] ${stderr}`)
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve(`[spawnClaude spawn error] ${err.message}`)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) return resolve(`[spawnClaude exited ${code}] ${stderr}`)
      resolve(stdout)
    })
  })
}

/**
 * Builds a serialized spawnClaude(systemPrompt, prompt) bound to the given
 * runner (real by default, fake in harness unit tests). Every call chains
 * onto the previous one so concurrency never exceeds 1 regardless of how the
 * caller schedules its dataset.
 */
export function createSpawnClaude(runner = realRunner) {
  let queue = Promise.resolve()
  return function spawnClaude(systemPrompt, prompt, options) {
    const run = queue.then(() => runner(systemPrompt, prompt, options))
    queue = run.catch(() => {}) // runner never rejects, but guard the chain anyway
    return run
  }
}
