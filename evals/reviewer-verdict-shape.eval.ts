/**
 * reviewer-verdict-shape — reviewer.md's OUTPUT contract: lead with one
 * verdict (pass/fail/needs-input), then findings each anchored to
 * `path:line`. Each scenario hands the reviewer a small fabricated diff
 * with an obvious bug and asks for the review.
 *
 * reviewer.md is loaded fresh from disk via loadPrompt.
 *
 * SERIAL ONLY — see evals/README.md. Never wired into `bun run test` / CI.
 */
import { evalite } from 'evalite'
import { loadPrompt } from './lib/loadPrompt.mjs'
import { createSpawnClaude } from './lib/spawnClaude.mjs'
import { scoreVerdictShape } from './lib/scorers.mjs'

const SYSTEM_PROMPT = loadPrompt('agents/reviewer.md')
const spawnClaude = createSpawnClaude()

const scenarios = [
  {
    input: `Review this diff:

diff --git a/src/pricing.ts b/src/pricing.ts
index 1111111..2222222 100644
--- a/src/pricing.ts
+++ b/src/pricing.ts
@@ -10,7 +10,7 @@ export function applyDiscount(total: number, pct: number): number {
-  return total - total * pct
+  return total - total * pct / 100
   // NOTE: pct is expected as a whole-number percentage (e.g. 10 for 10%),
   // but every caller in this diff still passes a fraction (e.g. 0.1),
   // so this now silently under-discounts by 100x for every existing caller.
`
  },
  {
    input: `Review this diff:

diff --git a/src/auth/session.ts b/src/auth/session.ts
index 3333333..4444444 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -20,6 +20,9 @@ export function verifySession(token: string): Session | null {
   const decoded = decode(token)
+  if (!decoded) {
+    return { userId: 'anonymous', role: 'admin' } as Session
+  }
   return decoded.exp > Date.now() ? decoded : null
`
  }
]

evalite('reviewer-verdict-shape', {
  data: async () => scenarios,
  task: async (input) => spawnClaude(SYSTEM_PROMPT, input),
  scorers: [
    {
      name: 'leads-with-verdict-and-cites-file-line',
      scorer: ({ output }) => scoreVerdictShape(output).score
    }
  ]
})
