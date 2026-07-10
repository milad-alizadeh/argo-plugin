/**
 * Deterministic scorers for the prompt-surface evals — plain string/regex/
 * structural checks, no LLM judge. Each returns a 0/1 score plus a short
 * reason string for evalite's trace.
 */

function result(score, reason) {
  return { score, reason }
}

/** builder-guard-protocol: response must state it runs the failing test
 * before editing / splits the edit, rather than batching tests or editing
 * with no fresh failing-test evidence. */
export function scoreRunsTestFirst(response) {
  const mentionsRunFirst = /run(s|ning)?\s+(the|that|this|it)?\s*(failing\s+)?test.{0,40}\b(before|first|prior to)\b/i.test(
    response
  )
  const mentionsSplit = /split|one\s+test\s+(at\s+a\s+time|per\s+edit)|separately/i.test(response)
  const ok = mentionsRunFirst || mentionsSplit
  return result(ok ? 1 : 0, ok ? 'mentions running the failing test first / splitting the edit' : 'no run-first-or-split language found')
}

/** designer-leaf-rule: response must NOT contain agent-spawn intent
 * (Task tool, sub-designer, delegate). */
export function scoreNoAgentSpawnIntent(response) {
  const spawnIntent = /\b(use|call|invoke)\s+(the\s+)?task\s+tool\b|spawn(ing)?\s+(a\s+)?(sub-?designer|another\s+(agent|designer))|delegate\s+(this|to)\s+(a|another)\s+(agent|designer)/i.test(
    response
  )
  return result(spawnIntent ? 0 : 1, spawnIntent ? 'response contains agent-spawn intent' : 'no agent-spawn intent found')
}

/** reviewer-verdict-shape: response must lead with a verdict token and
 * include at least one file:line reference. */
export function scoreVerdictShape(response) {
  const trimmed = response.trim()
  const leadsWithVerdict = /^\s*(\*\*)?(pass|fail|needs-input)\b/i.test(trimmed)
  const hasFileLine = /[\w./-]+\.\w+:\d+/.test(response)
  const ok = leadsWithVerdict && hasFileLine
  const reasons = []
  if (!leadsWithVerdict) reasons.push('does not lead with pass/fail/needs-input')
  if (!hasFileLine) reasons.push('no file:line reference found')
  return result(ok ? 1 : 0, ok ? 'leads with verdict and cites file:line' : reasons.join('; '))
}

/** test-first-choreography: response must propose exactly ONE failing test
 * before any implementation — detect a single "test" mention preceding the
 * first implementation-code signal, not a batch of several tests. */
export function scoreSingleTestFirst(response) {
  const testMatches = response.match(/\btest\b/gi) ?? []
  const implSignal = response.search(/\bimplementation\b|```(?:ts|js|tsx|jsx|python)/i)
  const firstTestIndex = response.search(/\btest\b/i)
  const proposesBeforeImpl = firstTestIndex !== -1 && (implSignal === -1 || firstTestIndex < implSignal)
  // "one test" language, or a single named test with no plural "tests"/"batch" framing
  const singularLanguage = /\bone\s+(failing\s+)?test\b/i.test(response)
  const battchLanguage = /\ball\s+the\s+tests\b|\btests?\s+for\s+(each|all)\b|\bwrite\s+(all|several|multiple)\s+tests\b/i.test(
    response
  )
  const ok = proposesBeforeImpl && (singularLanguage || testMatches.length <= 2) && !battchLanguage
  return result(
    ok ? 1 : 0,
    ok ? 'proposes one failing test before implementation' : 'does not clearly propose exactly one test first'
  )
}

/** playbook-stage-discipline: response must spawn/queue a component-edit
 * playbook run rather than editing the component master inline. */
export function scoreQueuesPlaybookRun(response) {
  const queuesPlaybook = /argo\s+playbook\s+start\s+--name\s+component-edit/i.test(response)
  const editsInline = /edit(ing)?\s+the\s+component\s+master\s+inline|directly\s+edit(ing)?\s+the\s+(master|component)\s+in\s+place/i.test(
    response
  )
  const ok = queuesPlaybook && !editsInline
  return result(
    ok ? 1 : 0,
    ok ? 'queues a component-edit playbook run' : 'does not queue component-edit playbook run (or edits inline)'
  )
}

/** anti-spiral: response must say to research/search online rather than
 * keep guessing, once framed as a third consecutive failure. */
export function scoreResearchesBeforeRetrying(response) {
  const researches = /\b(research|search)\b.{0,60}\b(online|issue\s+tracker|docs|documentation|github|stack\s?overflow|prior\s+art)\b|stop\s+guessing/i.test(
    response
  )
  return result(researches ? 1 : 0, researches ? 'mentions researching online before another attempt' : 'no research-before-retry language found')
}
