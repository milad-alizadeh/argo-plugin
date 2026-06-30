// ─────────────────────────────────────────────────────────────────────────
// ISOLATION & SAFETY CONTRACT: this workflow is tree-agnostic — it builds in the CURRENT
// working tree and commits each confirmed slice to the CURRENT branch. It creates no
// isolation of its own; the caller (the /argo:build-feature skill) MUST invoke it on a
// DEDICATED FEATURE BRANCH with a CLEAN working tree. Under that contract the retry
// cleanup (git reset --hard HEAD + a scoped clean) only ever discards the current rejected
// attempt — confirmed slices are already committed, and a clean-at-start tree means the
// clean removes only this run's debris. Do NOT run it on a dirty tree or the default branch.
//
// Stages share ONE tree by necessity (Verify runs the builder's code; Confirm reads its
// diff; Land commits it), so never set per-agent worktree isolation. True worktree
// isolation for concurrent runs is the caller's concern and is currently UNVERIFIED — the
// Workflow engine can't pin a spawned subagent's cwd, so it would depend on subagents
// inheriting the session cwd; confirm empirically before relying on it (a wrong cwd + the
// retry reset is destructive). See /argo:build-feature.
//
// graphify single-writer rule: Land stages ONLY slice source/tests, never graph artifacts;
// the integrator refreshes the graph on the default branch post-merge.
//
// DEPENDS ON argo:builder / argo:reviewer (installed with this plugin); unknown agentTypes
// silently fall back to general-purpose — /argo:build-feature preflights this.
//
// RESUME: retry state lives in plain locals, which the runtime's resume does not track;
// resuming a paused run re-enters a slice from attempt 1 (it never commits unverified
// work, so this is safe — just not retry-count-durable).
// ─────────────────────────────────────────────────────────────────────────
export const meta = {
  name: 'build-slice',
  description:
    'Build a planned feature, slice by slice, test-first — then verify each slice deterministically and adversarially confirm the tests are honest before committing. Seeds from a plan doc; maintains a durable progress doc.',
  whenToUse:
    'After a plan doc exists (e.g. from argo:planner), to build it slice-by-slice with verify + adversarial-confirm gating. Run via /argo:build-feature, which isolates it on a dedicated feature branch (commits land there, not on the default branch).',
  phases: [
    { title: 'Slice', detail: 'adapt the plan into an ordered, machine-readable slice list' },
    { title: 'Build', detail: 'builder implements one slice test-first' },
    { title: 'Verify', detail: 'gate: run the verify command, pass/fail from the real exit code' },
    { title: 'Confirm', detail: 'reviewer adversarially judges the tests honest + matrix covered' },
    { title: 'Land', detail: 'commit the confirmed slice' },
    { title: 'Track', detail: 'maintain a durable progress doc, updated per slice' },
  ],
}

// ── Inputs ────────────────────────────────────────────────────────────────
// args.planPath     — path to the phase plan doc that seeds the slices (required)
// args.verifyCmd    — the deterministic verify command (default: the repo's own)
// args.progressPath — where to write the live progress doc (default: alongside the plan)
const planPath = typeof args === 'string' ? args : args?.planPath
if (!planPath) throw new Error('build-slice: pass { planPath } (path to the phase plan doc) as args')
// NOTE: this bun default is a PLACEHOLDER. /argo:setup-claude rewrites it to the project's
// real detected commands on install; on a non-bun project the placeholder fails every slice.
const verifyCmd = args?.verifyCmd ?? 'bun run typecheck && bun run lint && bun run test'
const progressPath =
  args?.progressPath ?? (planPath.endsWith('.md') ? planPath.slice(0, -3) : planPath) + '-progress.md'
const MAX_ATTEMPTS = args?.maxAttempts ?? 3

// ── Schemas ───────────────────────────────────────────────────────────────
const SLICES = {
  type: 'object',
  required: ['slices'],
  properties: {
    slices: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'goal', 'acceptance', 'matrix'],
        properties: {
          id: { type: 'string', description: 'short kebab id, unique, e.g. mcp-ask-user' },
          goal: { type: 'string', description: 'the smallest shippable vertical slice' },
          acceptance: { type: 'string', description: 'what must be true, observed through the real interface' },
          matrix: {
            type: 'array',
            description: 'edge-case rows this slice must cover (testing.md categories); state "n/a: why" explicitly',
            items: { type: 'string' },
          },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of prerequisite slices' },
        },
      },
    },
  },
}
// Verify ties `passed` to the REAL process exit code — never to the model's opinion.
const VERIFY = {
  type: 'object',
  required: ['exitCode', 'passed', 'output'],
  properties: {
    exitCode: { type: 'integer', description: 'the actual exit status of the command' },
    passed: { type: 'boolean', description: 'strictly exitCode === 0' },
    output: { type: 'string', description: 'the literal trailing output (errors verbatim, not paraphrased)' },
  },
}
const VERDICT = {
  type: 'object',
  required: ['confirmed', 'reasons'],
  properties: {
    confirmed: { type: 'boolean', description: 'true ONLY if the tests are real, honest, and cover the matrix' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'merge-blocking issues; empty if confirmed' },
  },
}
const LANDED = {
  type: 'object',
  required: ['sha'],
  properties: { sha: { type: 'string', description: 'the commit SHA' } },
}

// ── Progress doc (durable oversight artifact) ───────────────────────────────
// Workflow scripts have no filesystem access, so the script renders the markdown
// deterministically and a thin haiku agent writes it verbatim. Republished when a
// slice starts and when it resolves, so the doc is always current even if the run dies.
const ICON = { pending: '⏳', building: '🔨', done: '✅', blocked: '⛔' }
function renderProgress(rows, summary) {
  const body = rows
    .map((r) => `| ${r.n} | \`${r.id}\` | ${ICON[r.status]} ${r.status} | ${r.attempts || '–'} | ${r.result || '–'} |`)
    .join('\n')
  return (
    `# Build progress — ${planPath}\n\n` +
    `Maintained by the \`build-slice\` workflow; verify command: \`${verifyCmd}\`.\n\n` +
    `**${summary}**\n\n` +
    `| # | slice | status | attempts | result |\n|---|---|---|---|---|\n${body}\n`
  )
}
async function publishProgress(rows, summary) {
  const content = renderProgress(rows, summary)
  await agent(
    `Write the following content VERBATIM to \`${progressPath}\` (create or overwrite). Do not add, summarise, ` +
      `or reformat anything; write exactly what is between the markers and nothing else. Then report "written".\n\n` +
      `----- BEGIN CONTENT -----\n${content}\n----- END CONTENT -----`,
    { label: 'progress', phase: 'Track', model: 'haiku', effort: 'low' },
  )
}

// ── Phase 1: adapt the plan into an ordered, machine-readable slice list ────
// Kept distinct from the planner: the planner writes a prose plan doc; this turns it
// into the typed slice list the loop consumes. If the plan is already well-decomposed
// this is a cheap adaptation, not a second planning pass.
phase('Slice')
const sliced = await agent(
  `Read the plan at \`${planPath}\`. Turn it into an ORDERED list of the smallest vertical slices that each ship ` +
    `a thin end-to-end behaviour observable through the REAL interface (per rules/testing.md). Order strictly by ` +
    `dependency (set dependsOn). For each: id, goal, acceptance (what a user/caller observes), and the edge-case ` +
    `matrix rows it must cover (standing categories from rules/testing.md; "n/a: why" for rows that don't apply). ` +
    `Do NOT write any code.`,
  { phase: 'Slice', schema: SLICES },
)
const slices = sliced?.slices
if (!slices?.length) throw new Error('build-slice: slicing produced no slices (agent skipped or plan empty)')
// Validate the order honours dependsOn so the sequential loop never builds on an unbuilt prerequisite.
const pos = new Map(slices.map((s, i) => [s.id, i]))
for (const s of slices)
  for (const dep of s.dependsOn ?? [])
    if (!pos.has(dep) || pos.get(dep) >= pos.get(s.id))
      throw new Error(`build-slice: slice "${s.id}" depends on "${dep}" which is missing or not ordered before it`)
log(`${slices.length} slice(s) planned from ${planPath}`)

const rows = slices.map((s, i) => ({ n: i + 1, id: s.id, status: 'pending', attempts: 0, result: '' }))
await publishProgress(rows, `0/${slices.length} slices confirmed.`)

// ── Per-slice loop: Build → Verify → Confirm → Land ─────────────────────────
// SEQUENTIAL by design: slices are dependency-ordered and share one working tree, so a
// single writer avoids git races. This is conservative, not fast — a multi-slice plan is a
// fire-and-forget run. Independent (dependsOn-free) slices could later run worktree-parallel.
const results = []
let confirmedCount = 0
for (const slice of slices) {
  const row = rows.find((r) => r.id === slice.id)
  row.status = 'building'
  await publishProgress(rows, `${confirmedCount}/${slices.length} confirmed — building ${slice.id}…`)

  let attempt = 0
  let confirmed = false
  let lastReasons = []

  while (attempt < MAX_ATTEMPTS && !confirmed) {
    attempt++
    row.attempts = attempt

    // On retry, discard the rejected attempt's debris so this attempt starts from the last
    // committed state — otherwise Build stacks on dead code and the diff-based Confirm misreads
    // a cumulative diff. (-e protects the untracked progress doc; gitignored files are untouched.)
    if (attempt > 1) {
      phase('Build')
      await agent(
        `Reset the working tree to the last commit so a retry starts clean. Run EXACTLY, from the repo root:\n\n` +
          `    git reset --hard HEAD && git clean -fd -e '*-progress.md'\n\n` +
          `Then report "reset". Do not edit anything, do not run any other command.`,
        { label: `reset:${slice.id}#${attempt}`, phase: 'Build', model: 'haiku', effort: 'low' },
      )
    }

    // Build — test-first. Inside the workflow the builder runs ONLY focused slice tests for its
    // red→green loop and defers the authoritative full suite to Verify. This is a deliberate
    // trade: it avoids re-running a slow (e.g. e2e) suite on every inner iteration, at the cost
    // of catching cross-slice integration breakage at the gate (one retry) rather than in-loop.
    // Nothing commits until Verify+Confirm pass, so the deferral never lands broken work.
    phase('Build')
    await agent(
      `Implement this vertical slice test-first (red→green→refactor):\n` +
        `  id: ${slice.id}\n  goal: ${slice.goal}\n  acceptance: ${slice.acceptance}\n` +
        `  edge-case matrix (each row needs a test through the real interface): ${slice.matrix.join('; ')}\n\n` +
        (attempt > 1
          ? `Your prior attempt was REJECTED and its changes were discarded. Start fresh and address exactly:\n- ${lastReasons.join('\n- ')}\n\n`
          : '') +
        `You are running INSIDE the build-slice workflow: run only FOCUSED tests for THIS slice during your ` +
        `red→green loop (the workflow owns the authoritative full verify next), and do NOT commit (the workflow ` +
        `commits after the slice is confirmed). When you run standalone, your normal full-suite + commit ` +
        `discipline applies — this deferral is workflow-scoped only.`,
      { agentType: 'argo:builder', label: `build:${slice.id}#${attempt}`, phase: 'Build' },
    )

    // Verify — the gate. An agent is the only option (no raw-shell primitive), but `passed` is
    // bound to the real exit code, not the model's judgement, and output is verbatim.
    phase('Verify')
    const verify = await agent(
      `Run EXACTLY this command from the repo root and nothing else:\n\n    ${verifyCmd}\n\n` +
        `Report the actual exit code, set passed = (exitCode === 0), and include the literal trailing output ` +
        `(failures verbatim — do NOT paraphrase or summarise). Do NOT edit any file or run any other command.`,
      { label: `verify:${slice.id}#${attempt}`, phase: 'Verify', schema: VERIFY },
    )
    if (!verify || !verify.passed) {
      lastReasons = [`verify command exited ${verify?.exitCode ?? '?'}:\n${verify?.output ?? '(verify step skipped or returned nothing)'}`]
      log(`slice ${slice.id}: verify RED (attempt ${attempt}, exit ${verify?.exitCode ?? '?'})`)
      continue
    }

    // Confirm — independent adversarial check against green-but-broken. The reviewer already
    // carries the test-honesty rules; this is the structural value (an unbiased reader, after
    // the builder, before commit), so the prompt stays lean.
    phase('Confirm')
    const verdict = await agent(
      `Slice "${slice.id}" passed \`${verifyCmd}\`. Without re-running anything, inspect the working-tree diff ` +
        `(git diff / git diff --staged) and judge ONLY whether its tests are honest. confirmed=true ONLY if the ` +
        `tests drive the feature through its REAL interface (not vacuous stubs), every required matrix row ` +
        `(${slice.matrix.join('; ')}) has a real test, and the acceptance ("${slice.acceptance}") is actually ` +
        `asserted. Be adversarial — catch green-but-broken. Otherwise confirmed=false with specific reasons.`,
      { agentType: 'argo:reviewer', label: `confirm:${slice.id}#${attempt}`, phase: 'Confirm', schema: VERDICT },
    )
    if (verdict?.confirmed) confirmed = true
    else {
      lastReasons = verdict?.reasons?.length ? verdict.reasons : ['confirm step was skipped or returned nothing']
      log(`slice ${slice.id}: verifier REJECTED (attempt ${attempt}): ${lastReasons[0]}`)
    }
  }

  if (!confirmed) {
    // HARD STOP — surface the thrashing slice; do not build dependents on a broken prerequisite.
    row.status = 'blocked'
    row.result = (lastReasons[0] ?? 'blocked').slice(0, 200)
    results.push({ id: slice.id, status: 'BLOCKED', attempts: attempt, lastReasons })
    await publishProgress(rows, `BLOCKED at ${slice.id} after ${attempt} attempts — ${confirmedCount}/${slices.length} confirmed.`)
    log(`slice ${slice.id}: BLOCKED after ${attempt} attempts — surfacing, not committing`)
    break
  }

  // Land — commit the confirmed slice with the repo's own identity. Sequential loop ⇒ single writer.
  phase('Land')
  const landed = await agent(
    `Commit the confirmed slice "${slice.id}" and nothing unrelated. Stage ONLY this slice's source and test ` +
      `files — never graph artifacts (do not stage anything under a graphify-out/ directory). Write a concise ` +
      `conventional-commit message (goal: ${slice.goal}), and commit using the repo's own git identity and signing. ` +
      `Do NOT push. Report the commit SHA.`,
    { agentType: 'argo:builder', label: `land:${slice.id}`, phase: 'Land', schema: LANDED },
  )
  const sha = landed?.sha ?? '(unreported)'
  confirmedCount++
  row.status = 'done'
  row.result = `\`${sha.slice(0, 10)}\``
  results.push({ id: slice.id, status: 'DONE', attempts: attempt, sha })
  await publishProgress(rows, `${confirmedCount}/${slices.length} slices confirmed.`)
}

const blocked = results.find((r) => r.status === 'BLOCKED')
return {
  plan: planPath,
  progress: progressPath,
  done: results.filter((r) => r.status === 'DONE').map((r) => r.id),
  blocked: blocked ? { id: blocked.id, reasons: blocked.lastReasons } : null,
  results,
}
