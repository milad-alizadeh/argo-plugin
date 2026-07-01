// ─────────────────────────────────────────────────────────────────────────
// ISOLATION: this workflow is tree-agnostic — it builds in the CURRENT working tree and
// commits each confirmed slice to the CURRENT branch. It creates no isolation of its own;
// the caller (the /argo:build-feature skill) runs it inside a dedicated git WORKTREE.
// Verified: the workflow's spawned subagents inherit the session's worktree cwd, so all
// building, the retry cleanup (git reset --hard HEAD + scoped clean), and per-slice commits
// happen inside that worktree on its branch — never the user's main checkout, and
// concurrent builds in separate worktrees can't collide on the git index.
//
// Stages share ONE tree by necessity (Verify runs the builder's code; Confirm reads its
// diff; Land commits it), so never set per-agent worktree isolation — the per-run worktree
// (one level up, owned by build-feature) is the isolation unit.
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
    'After a plan doc exists (e.g. from argo:planner), to build it slice-by-slice with verify + adversarial-confirm gating. Run via /argo:build-feature, which isolates it in its own git worktree (per-slice commits land on the worktree branch, never the main checkout).',
  phases: [
    { title: 'Slice', detail: 'adapt the plan into an ordered, machine-readable slice list' },
    { title: 'Red', detail: 'write the failing test FIRST; prove it fails for the right reason' },
    { title: 'Green', detail: 'implement the minimal real code to turn the red tests green' },
    { title: 'Verify', detail: 'gate: run the verify command, pass/fail from the real exit code' },
    { title: 'Confirm', detail: 'reviewer adversarially judges the tests honest + matrix covered' },
    { title: 'Land', detail: 'commit the confirmed slice' },
    { title: 'Track', detail: 'maintain a durable progress doc, updated per slice' },
  ],
}

// ── Inputs ────────────────────────────────────────────────────────────────
// args.planPath     — path to the phase plan doc that seeds the slices (required)
// args.verifyCmd    — the deterministic verify command (default: the repo's own)
// args.trustGateCmd — §7 gate chained onto Verify for requiresLaunch slices (default pipes a
//                     Stop-hook payload into $ARGO_TRUST_GATE; setup-claude sets the real path)
// args.blastRadiusPaths — repo-relative paths graphify flags as high blast radius; editing
//                     one escalates to review (build-feature passes .argo/blast-radius.json)
// args.progressPath — where to write the live progress doc (default: alongside the plan)
// args may arrive as an object, a JSON-encoded string (harness-dependent), or a bare plan path.
let opts = args
if (typeof opts === 'string') {
  try { opts = JSON.parse(opts) } catch { opts = { planPath: opts } }
}
const planPath = typeof opts === 'string' ? opts : opts?.planPath
if (!planPath) throw new Error('build-slice: pass { planPath } (path to the phase plan doc) as args')
// NOTE: this bun default is a PLACEHOLDER. /argo:setup-claude rewrites it to the project's
// real detected commands on install; on a non-bun project the placeholder fails every slice.
const verifyCmd = opts?.verifyCmd ?? 'bun run typecheck && bun run lint && bun run test'
// §7 trust-gate chain: for slices marked requiresLaunch, Verify becomes
// `${verifyCmd} && ${trustGateCmd}` so it goes RED without launch evidence. The default
// pipes a Stop-hook payload (carrying $PWD) into the gate; /argo:setup-claude rewrites
// $ARGO_TRUST_GATE to the installed plugin hook path. Mirrors plugin/lib/gatedVerify.mjs
// (the tested source of truth — workflow scripts can't import local modules).
const trustGateCmd =
  opts?.trustGateCmd ??
  `node -e 'process.stdout.write(JSON.stringify({cwd:process.cwd()}))' | node "\${ARGO_TRUST_GATE:?set ARGO_TRUST_GATE to trust-gate.mjs}"`
const gatedVerify = (base, requiresLaunch) => (requiresLaunch ? `${base} && ${trustGateCmd}` : base)
const progressPath =
  opts?.progressPath ?? (planPath.endsWith('.md') ? planPath.slice(0, -3) : planPath) + '-progress.md'
const MAX_ATTEMPTS = opts?.maxAttempts ?? 2

// ── Tiered reviewer gating (council-decided) ────────────────────────────────
// The independent reviewer (Confirm) is expensive and — per the measurement — adds
// ~zero value on trivial slices but catches real bugs on risky ones. So run it only
// when warranted. ESCALATE-ONLY: the planner's `reviewRisk` can raise review but a
// `low` flag never SUPPRESSES a review a deterministic trigger demands.
// Triggers: planner flagged high | slice launches app behaviour | a changed path is
// risk-sensitive | a periodic drift sample. NOTE deliberately NOT gating on diff SIZE
// — the real bugs we've caught were one-liners (size is anti-correlated with danger).
// Known gap (needs a shell/content-scan, deferred): unnamed risk (a new IPC channel,
// exec/eval, a DELETED check) that touches no risky-named path. When the reviewer
// catches such a case, codify it as a new RISKY_PATHS entry so it's caught for free next.
const RISKY_PATHS =
  opts?.riskyPaths ??
  /(^|\/)(hooks|preload|ipc|auth|security|crypto|permissions|secrets|session|middleware|migrations)(\/|$)|\.env|mcp\.json|settings\.json|package\.json|bun\.lock/i
const REVIEW_SAMPLE_EVERY = opts?.reviewSampleEvery ?? 5
// Graphify blast-radius hot-set: paths the knowledge graph flags as high-impact (many
// dependents). The risky-path glob's DATA-DERIVED cousin — catches the UNNAMED central
// module the glob misses. Populated by the caller from graphify (.argo/blast-radius.json,
// dependency edges only); empty when graphify is absent or the graph lacks real dep edges,
// so it simply adds no escalation until the graph is rich enough. Escalate-only.
const BLAST_RADIUS = new Set(Array.isArray(opts?.blastRadiusPaths) ? opts.blastRadiusPaths : [])
function shouldReview(slice, changedPaths, index) {
  if (slice.reviewRisk === 'high') return { review: true, why: 'planner marked reviewRisk:high' }
  if (slice.requiresLaunch === true) return { review: true, why: 'requiresLaunch (app behaviour)' }
  const hit = (changedPaths ?? []).find((p) => RISKY_PATHS.test(p))
  if (hit) return { review: true, why: `risk-sensitive path: ${hit}` }
  const hot = (changedPaths ?? []).find((p) => BLAST_RADIUS.has(p))
  if (hot) return { review: true, why: `high blast radius (graphify): ${hot}` }
  if (index % REVIEW_SAMPLE_EVERY === 0) return { review: true, why: `drift sample (1-in-${REVIEW_SAMPLE_EVERY})` }
  return { review: false, why: 'low-risk: deterministic gates only' }
}
// Green reports the paths it changed (mechanical self-report — not a risk judgement) so the
// gate can check them against RISKY_PATHS deterministically.
const GREEN_REPORT = {
  type: 'object',
  required: ['changedPaths'],
  properties: {
    changedPaths: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths this slice created or modified' },
  },
}

// ── Schemas ───────────────────────────────────────────────────────────────
const SLICES = {
  type: 'object',
  required: ['slices'],
  properties: {
    slices: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'goal', 'acceptance', 'matrix', 'reviewRisk', 'testSurface'],
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
          requiresLaunch: {
            type: 'boolean',
            description:
              'true ONLY if this slice ships app/UI behaviour a user launches and exercises — such slices are ' +
              'gated by the trust gate (§8.2): Verify goes RED unless a launch evidence receipt proves the app ' +
              'was launched AND exercised. Pure logic / library / config slices are false (the default).',
          },
          reviewRisk: {
            type: 'string',
            enum: ['low', 'high'],
            description:
              "'high' if this slice touches security/correctness-sensitive surface (auth, the trust gate, " +
              'crypto/secrets, concurrency, IPC/preload boundaries, permissions, data migrations) or you judge it ' +
              'error-prone — it will get an independent adversarial review. \'low\' for routine logic/config. You may ' +
              'only RAISE risk; a low flag never suppresses a review a risk-sensitive path or sample forces.',
          },
          testSurface: {
            type: 'string',
            enum: ['unit', 'e2e', 'both'],
            description:
              "Which harness proves this slice through its REAL interface (rules/testing.md): 'unit' = fast " +
              'headless runner (e.g. vitest) driving the real API/store/DB/CLI directly; ' +
              "'e2e' = the app driven through its real UI (e.g. Playwright against the running app); " +
              "'both' when the same behaviour must be proven headless AND through the running app. Pick by what " +
              'the real interface actually IS — do not default to unit for UI or e2e for pure logic.',
          },
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
// Red-proof: the test must exist and fail for the RIGHT reason BEFORE any implementation —
// makes test-first verifiable, not merely asserted.
const RED = {
  type: 'object',
  required: ['testCommand', 'failingOutput', 'failedForRightReason'],
  properties: {
    testCommand: { type: 'string', description: "exact command that runs THIS slice's new tests" },
    failingOutput: { type: 'string', description: 'verbatim failing output proving the tests are RED' },
    failedForRightReason: {
      type: 'boolean',
      description: 'true iff they fail because the behaviour/module under test is missing/incorrect — NOT because the test file itself is malformed',
    },
    notes: { type: 'string' },
  },
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
    // committed state — otherwise it stacks on dead code and the diff-based Confirm misreads
    // a cumulative diff. (-e protects the untracked progress doc; gitignored files are untouched.)
    if (attempt > 1) {
      phase('Red')
      await agent(
        `Reset the working tree to the last commit so a retry starts clean. Run EXACTLY, from the repo root:\n\n` +
          `    git reset --hard HEAD && git clean -fd -e '*-progress.md'\n\n` +
          `Then report "reset". Do not edit anything, do not run any other command.`,
        { label: `reset:${slice.id}#${attempt}`, phase: 'Red', model: 'haiku', effort: 'low' },
      )
    }

    // RED — write the failing test(s) FIRST and prove they fail for the right reason. NO
    // implementation. This makes test-first VERIFIABLE: a slice cannot reach Green/Land without a
    // captured red proof — defending against "wrote the impl, backfilled a passing test".
    phase('Red')
    const red = await agent(
      `Follow the \`test-first\` and \`engineering-principles\` skills throughout.\n\n` +
        `RED step of strict test-first — write ONLY the test(s), NO implementation:\n` +
        `  id: ${slice.id}\n  goal: ${slice.goal}\n  acceptance: ${slice.acceptance}\n` +
        `  test surface: ${slice.testSurface} — ${slice.testSurface === 'unit' ? 'drive the real API/store/DB/CLI directly in the headless runner (e.g. vitest); do NOT stand up the app UI' : slice.testSurface === 'e2e' ? 'drive the running app through its real UI (e.g. Playwright); do NOT unit-test the logic in isolation' : 'BOTH — a headless test on the real API/store/DB AND an e2e test through the running app UI'}\n` +
        `  edge-case matrix (each row needs a test through the REAL interface, per rules/testing.md): ${slice.matrix.join('; ')}\n\n` +
        (attempt > 1
          ? `Your prior attempt was REJECTED and discarded. Start fresh; address these rejection reasons:\n- ${lastReasons.join('\n- ')}\n\n`
          : '') +
        `Write tests on the ${slice.testSurface} surface named above that exercise the feature through its real interface and cover every applicable matrix row. Then ` +
        `RUN them and capture the output. They MUST FAIL — and fail because the behaviour/module under test is missing ` +
        `or incorrect, NOT because the test file itself is malformed (a typo/syntax error in the test). Do NOT write or ` +
        `modify any implementation code. Do NOT commit. Report the exact test command, the verbatim failing output, and ` +
        `whether they failed for the right reason.`,
      { agentType: 'argo:builder', label: `red:${slice.id}#${attempt}`, phase: 'Red', schema: RED },
    )
    if (!red || !red.failedForRightReason) {
      lastReasons = [`RED not proven (strict test-first failed): ${red?.notes ?? red?.failingOutput ?? '(no red proof produced)'}`]
      log(`slice ${slice.id}: RED not proven (attempt ${attempt})`)
      continue
    }
    log(`slice ${slice.id}: RED proven (attempt ${attempt}) via \`${red.testCommand}\``)

    // GREEN — implement the minimal real code to turn the now-existing red tests green, then
    // refactor. Focused tests only in-loop; the authoritative full suite is the Verify gate next.
    phase('Green')
    const green = await agent(
      `Follow the \`test-first\` and \`engineering-principles\` skills throughout.\n\n` +
        `GREEN step: make the failing tests from the RED step pass by implementing this slice.\n` +
        `  slice: ${slice.id} — ${slice.goal}\n  the tests already exist (command: ${red.testCommand}) and currently fail:\n` +
        `${red.failingOutput}\n\n` +
        `Implement the minimal REAL code to turn them green, then refactor. You may correct a test ONLY if it is ` +
        `genuinely wrong (e.g. asserts on an implementation detail) — say so explicitly; do NOT weaken or delete tests ` +
        `to force green. Run only the FOCUSED tests for this slice during your loop (the workflow owns the ` +
        `authoritative full verify next). Do NOT commit (the workflow commits after the slice is confirmed). ` +
        `Report the repo-relative paths of every file you created or modified.`,
      { agentType: 'argo:builder', label: `green:${slice.id}#${attempt}`, phase: 'Green', schema: GREEN_REPORT },
    )

    // Verify — the gate. An agent is the only option (no raw-shell primitive), but `passed` is
    // bound to the real exit code, not the model's judgement, and output is verbatim. For
    // launch-requiring slices the trust gate (§8.2) is chained on, so Verify goes RED unless a
    // launch evidence receipt proves the app was launched AND exercised.
    const sliceVerify = gatedVerify(verifyCmd, slice.requiresLaunch === true)
    phase('Verify')
    const verify = await agent(
      `Run EXACTLY this command from the repo root and nothing else:\n\n    ${sliceVerify}\n\n` +
        `Report the actual exit code, set passed = (exitCode === 0), and include the literal trailing output ` +
        `(failures verbatim — do NOT paraphrase or summarise). Do NOT edit any file or run any other command.`,
      { label: `verify:${slice.id}#${attempt}`, phase: 'Verify', schema: VERIFY },
    )
    if (!verify || !verify.passed) {
      lastReasons = [`verify command (${sliceVerify}) exited ${verify?.exitCode ?? '?'}:\n${verify?.output ?? '(verify step skipped or returned nothing)'}`]
      log(`slice ${slice.id}: verify RED (attempt ${attempt}, exit ${verify?.exitCode ?? '?'})`)
      continue
    }

    // Confirm — independent adversarial check against green-but-broken, but ONLY when the
    // slice warrants it (tiered gating). Deterministic gates (red-proof + real-exit Verify +
    // trust gate) have already passed; the reviewer adds value only on risk/judgment surface.
    const gate = shouldReview(slice, green?.changedPaths, slices.indexOf(slice))
    if (!gate.review) {
      confirmed = true
      log(`slice ${slice.id}: review SKIPPED (${gate.why}) — deterministic gates passed`)
      continue
    }
    log(`slice ${slice.id}: review REQUIRED (${gate.why})`)
    phase('Confirm')
    const verdict = await agent(
      `Slice "${slice.id}" passed \`${sliceVerify}\`. Its tests were proven RED before implementation ` +
        `(red command: \`${red.testCommand}\`). Without re-running anything, inspect the working-tree diff ` +
        `(git diff / git diff --staged) and judge ONLY whether its tests are honest. confirmed=true ONLY if the ` +
        `tests drive the feature through its REAL interface (not vacuous stubs), every required matrix row ` +
        `(${slice.matrix.join('; ')}) has a real test, the acceptance ("${slice.acceptance}") is actually asserted, ` +
        `and the tests were NOT weakened/gutted between red and green to force a pass. Be adversarial — catch ` +
        `green-but-broken. Otherwise confirmed=false with specific reasons.`,
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
  results.push({ id: slice.id, status: 'DONE', attempts: attempt, sha, redProven: true })
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
