import { defineConfig } from 'evalite/config'

// Every eval task spawns the on-device `claude` CLI, which shares this
// machine's one subscription seat. maxConcurrency: 1 keeps evalite from
// scheduling more than one test case at a time — see the SERIAL ONLY note
// in eval/card-routing.eval.ts for why (concurrent spawns burst the
// account's server-side rate limit and can take down other running agents).
export default defineConfig({
  maxConcurrency: 1,
  testTimeout: 90_000
})
