/**
 * scoreRouting — deterministic 0/1 scorer: does a `claude --print` response
 * mention the expected routing token for a scenario? No LLM judge, no
 * fuzziness — plain regex match on the response text.
 */
export function scoreRouting(response, expectedPattern) {
  return expectedPattern.test(response) ? 1 : 0
}
