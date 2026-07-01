// Builds every slice in a plan doc, test-first, in the current worktree/branch.
// Per slice: one argo:builder call does red -> green -> revert-check -> verify -> self-commit.
// An independent argo:reviewer only runs for risk-flagged slices. One final review pass
// checks the whole run's diff at the end. Progress is written to a durable doc per slice.
export const meta = {
  name: 'build-slices',
  description:
    'Build a planned feature, slice by slice, test-first — one builder call per slice runs red-green-revertcheck-verify and self-commits, with an independent review only for risk-flagged slices, plus one final batch review. Seeds from a plan doc; maintains a durable progress doc.',
  whenToUse:
    'After a plan doc exists (e.g. from argo:planner), to build it slice-by-slice with deterministic gates and risk-tiered review. Run via /argo:build-feature, which isolates it in its own git worktree (per-slice commits land on the worktree branch, never the main checkout).',
  phases: [
    { title: 'Slice', detail: 'adapt the plan into an ordered, machine-readable slice list' },
    { title: 'Build', detail: 'one agent per slice: red -> green -> revert-check -> verify -> self-commit' },
    { title: 'Confirm', detail: 'independent reviewer, ONLY for risk-flagged slices, before/instead of self-commit' },
    { title: 'Land', detail: 'commit a Confirm-approved slice that held off self-committing' },
    { title: 'Final Review', detail: 'one advisory batch pass over the whole run diff, once, at the end' },
    { title: 'Track', detail: 'maintain a durable progress doc, updated per slice' },
  ],
}

// Inputs: args.planPath (required), args.verifyCmd, args.trustGateCmd, args.progressPath,
// args.maxAttempts, args.riskyPaths, args.reviewSampleEvery. May arrive as an object, a
// JSON-encoded string, or a bare plan path.
let opts = args
if (typeof opts === 'string') {
  try { opts = JSON.parse(opts) } catch { opts = { planPath: opts } }
}
const planPath = typeof opts === 'string' ? opts : opts?.planPath
if (!planPath) throw new Error('build-slices: pass { planPath } (path to the phase plan doc) as args')
const verifyCmd = opts?.verifyCmd ?? 'bun run typecheck && bun run lint && bun run test'
const trustGateCmd =
  opts?.trustGateCmd ??
  `node -e 'process.stdout.write(JSON.stringify({cwd:process.cwd()}))' | node "\${ARGO_TRUST_GATE:?set ARGO_TRUST_GATE to trust-gate.mjs}"`
// Chains the trust gate onto Verify for slices that ship launchable app behaviour.
const gatedVerify = (base, requiresLaunch) => (requiresLaunch ? `${base} && ${trustGateCmd}` : base)
const progressPath =
  opts?.progressPath ?? (planPath.endsWith('.md') ? planPath.slice(0, -3) : planPath) + '-progress.md'
const MAX_ATTEMPTS = opts?.maxAttempts ?? 2

// Decides whether a slice needs the independent reviewer. Escalate-only: reviewRisk/
// requiresLaunch/a risky path/the sample rate can each force review; nothing suppresses one.
const RISKY_PATHS =
  opts?.riskyPaths ??
  /(^|\/)(hooks|preload|ipc|auth|security|crypto|permissions|secrets|session|middleware|migrations)(\/|$)|\.env|mcp\.json|settings\.json|package\.json|bun\.lock/i
const REVIEW_SAMPLE_EVERY = opts?.reviewSampleEvery ?? 5
// Known before Build runs (no changedPaths yet).
function preflightReview(slice, index) {
  if (slice.reviewRisk === 'high') return { review: true, why: 'planner marked reviewRisk:high' }
  if (slice.requiresLaunch === true) return { review: true, why: 'requiresLaunch (app behaviour)' }
  if (index % REVIEW_SAMPLE_EVERY === 0) return { review: true, why: `drift sample (1-in-${REVIEW_SAMPLE_EVERY})` }
  return { review: false, why: 'low-risk (upfront): pending path check' }
}
// Re-checked after Build using the real changedPaths; the script has final say, not the model.
function shouldReview(slice, changedPaths, index) {
  const pre = preflightReview(slice, index)
  if (pre.review) return pre
  const hit = (changedPaths ?? []).find((p) => RISKY_PATHS.test(p))
  if (hit) return { review: true, why: `risk-sensitive path: ${hit}` }
  return { review: false, why: 'low-risk: deterministic gates only' }
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
              'crypto/secrets, concurrency, IPC/preload boundaries, permissions, data migrations), OR touches a ' +
              'HIGH-BLAST-RADIUS module — one many others depend on in the graphify graph (check GRAPH_REPORT.md / ' +
              'graph.json for dependents; a change there ripples widely) — OR you judge it error-prone. It then gets ' +
              "an independent adversarial review before it can commit. 'low' for routine, low-fan-in logic/config. " +
              'You may only RAISE risk; a low flag never suppresses a review a risk-sensitive path or sample forces.',
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
const BUILD = {
  type: 'object',
  required: [
    'testCommand', 'failingOutput', 'failedForRightReason', 'changedPaths',
    'revertCheckPassed', 'verifyExitCode', 'verifyPassed', 'verifyOutput',
    'needsReview', 'committed',
  ],
  properties: {
    testCommand: { type: 'string', description: "exact command that runs THIS slice's new tests" },
    failingOutput: { type: 'string', description: 'verbatim RED output, before implementation' },
    failedForRightReason: {
      type: 'boolean',
      description: 'true iff the tests failed because the behaviour/module under test is missing/incorrect — NOT because the test file itself is malformed',
    },
    changedPaths: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths of every file you created or modified (tests + implementation)' },
    revertCheckPassed: {
      type: 'boolean',
      description:
        'You temporarily reverted ONLY the implementation changes (kept the test files as-is) and re-ran testCommand — ' +
        'it MUST fail again. true iff it failed again (proves the test actually exercises the behaviour, not a vacuous ' +
        'assertion that can never fail). You then restored the implementation before continuing. This step is required, ' +
        'not optional — do not skip it.',
    },
    revertCheckNotes: { type: 'string', description: 'what you saw on revert (the failure), or why revert-check could not run' },
    verifyExitCode: { type: 'integer', description: 'the actual exit status of the full verify command' },
    verifyPassed: { type: 'boolean', description: 'strictly verifyExitCode === 0' },
    verifyOutput: { type: 'string', description: 'the literal trailing output of the verify command (failures verbatim)' },
    needsReview: {
      type: 'boolean',
      description:
        'If the workflow told you upfront that review IS required for this slice, this MUST be true and you must NOT ' +
        'commit. If not told upfront, self-check every path in changedPaths against the risk-sensitive pattern given ' +
        'to you; if ANY matches, set this true and do NOT commit. Otherwise false.',
    },
    committed: { type: 'boolean', description: 'true iff you ran git commit for this slice — only allowed when needsReview is false' },
    sha: { type: 'string', description: 'the commit SHA, only present if committed is true' },
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
const FINAL_VERDICT = {
  type: 'object',
  required: ['ok', 'findings'],
  properties: {
    ok: { type: 'boolean', description: 'true iff no merge-blocking cross-slice/emergent issue was found across the whole run diff' },
    findings: { type: 'array', items: { type: 'string' }, description: 'specific issues, each with file:line; empty if ok' },
  },
}

// Renders + writes the durable progress doc.
const ICON = { pending: '⏳', building: '🔨', done: '✅', blocked: '⛔' }
function renderProgress(rows, summary) {
  const body = rows
    .map((r) => `| ${r.n} | \`${r.id}\` | ${ICON[r.status]} ${r.status} | ${r.attempts || '–'} | ${r.result || '–'} |`)
    .join('\n')
  return (
    `# Build progress — ${planPath}\n\n` +
    `Maintained by the \`build-slices\` workflow; verify command: \`${verifyCmd}\`.\n\n` +
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

// Decompose the plan into an ordered, typed slice list.
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
if (!slices?.length) throw new Error('build-slices: slicing produced no slices (agent skipped or plan empty)')
const pos = new Map(slices.map((s, i) => [s.id, i]))
for (const s of slices)
  for (const dep of s.dependsOn ?? [])
    if (!pos.has(dep) || pos.get(dep) >= pos.get(s.id))
      throw new Error(`build-slices: slice "${s.id}" depends on "${dep}" which is missing or not ordered before it`)
log(`${slices.length} slice(s) planned from ${planPath}`)

const rows = slices.map((s, i) => ({ n: i + 1, id: s.id, status: 'pending', attempts: 0, result: '' }))
await publishProgress(rows, `0/${slices.length} slices confirmed.`)

// Sequential: slices are dependency-ordered and share one working tree.
const results = []
let confirmedCount = 0
for (const slice of slices) {
  const index = slices.indexOf(slice)
  const row = rows.find((r) => r.id === slice.id)
  row.status = 'building'
  await publishProgress(rows, `${confirmedCount}/${slices.length} confirmed — building ${slice.id}…`)

  const sliceVerify = gatedVerify(verifyCmd, slice.requiresLaunch === true)
  const pre = preflightReview(slice, index)

  let attempt = 0
  let confirmed = false
  let sha = null
  let lastReasons = []

  while (attempt < MAX_ATTEMPTS && !confirmed) {
    attempt++
    row.attempts = attempt

    // One agent: red -> green -> revert-check -> verify -> self-commit unless risky.
    phase('Build')
    const build = await agent(
      `Follow the \`test-first\` and \`engineering-principles\` skills throughout.\n\n` +
        (attempt > 1
          ? `RETRY (attempt ${attempt}). First run EXACTLY: \`git reset --hard HEAD && git clean -fd -e '*-progress.md'\` ` +
            `to discard your previous rejected attempt, then start fresh. Prior rejection reasons — address them:\n` +
            `- ${lastReasons.join('\n- ')}\n\n`
          : '') +
        `Build this slice STRICT TEST-FIRST, all in this one session:\n` +
        `  id: ${slice.id}\n  goal: ${slice.goal}\n  acceptance: ${slice.acceptance}\n` +
        `  test surface: ${slice.testSurface} — ${slice.testSurface === 'unit' ? 'drive the real API/store/DB/CLI directly in the headless runner (e.g. vitest); do NOT stand up the app UI' : slice.testSurface === 'e2e' ? 'drive the running app through its real UI (e.g. Playwright); do NOT unit-test the logic in isolation' : 'BOTH — a headless test on the real API/store/DB AND an e2e test through the running app UI'}\n` +
        `  edge-case matrix (each row needs a test through the REAL interface, per rules/testing.md): ${slice.matrix.join('; ')}\n\n` +
        `STEP 1 — RED: write ONLY the test(s), no implementation. Run them; they MUST fail, and fail because the ` +
        `behaviour/module is missing/incorrect, NOT because the test file itself is malformed. Report failedForRightReason honestly.\n\n` +
        `STEP 2 — GREEN: implement the minimal real code to turn them green. You may correct a test ONLY if it is ` +
        `genuinely wrong (say so in revertCheckNotes) — do NOT weaken or delete a test to force green.\n\n` +
        `STEP 3 — REVERT-CHECK (required, do not skip): temporarily revert ONLY your implementation changes (git stash ` +
        `push, or manually undo — keep the test files as they are), re-run testCommand — it MUST fail again. If it ` +
        `still passes, your test is vacuous (asserts nothing real) — fix the test, do not proceed. Then restore your ` +
        `implementation (git stash pop, or reapply). Report revertCheckPassed honestly.\n\n` +
        `STEP 4 — VERIFY: run EXACTLY this command from the repo root: \`${sliceVerify}\` — report the real exit code ` +
        `and set verifyPassed = (exitCode === 0). Do not paraphrase failures; include them verbatim.\n\n` +
        `STEP 5 — COMMIT DECISION: ${pre.review
          ? `this slice was FLAGGED for independent review upfront (${pre.why}) — do NOT commit. Set needsReview=true, committed=false, and stop after verify.`
          : `check EVERY path in changedPaths against this pattern (JS regex): ${RISKY_PATHS.source} — if ANY path ` +
            `matches, set needsReview=true and do NOT commit. Otherwise set needsReview=false and commit yourself now: ` +
            `stage ONLY this slice's source and test files (never anything under a graphify-out/ directory), write a ` +
            `concise conventional-commit message (goal: ${slice.goal}), commit with the repo's own git identity/signing, ` +
            `do NOT push, and report committed=true with the sha.`
        }`,
      { agentType: 'argo:builder', label: `build:${slice.id}#${attempt}`, phase: 'Build', schema: BUILD },
    )

    if (!build || !build.failedForRightReason) {
      lastReasons = [`RED not proven: ${build?.revertCheckNotes ?? build?.failingOutput ?? '(no red proof produced)'}`]
      log(`slice ${slice.id}: RED not proven (attempt ${attempt})`)
      continue
    }
    if (!build.revertCheckPassed) {
      lastReasons = [`revert-check FAILED — the test still passes with the implementation reverted (vacuous test): ${build.revertCheckNotes ?? '(no notes)'}`]
      log(`slice ${slice.id}: revert-check failed (attempt ${attempt}) — vacuous test`)
      continue
    }
    if (!build.verifyPassed) {
      lastReasons = [`verify command (${sliceVerify}) exited ${build.verifyExitCode ?? '?'}:\n${build.verifyOutput ?? '(no output)'}`]
      log(`slice ${slice.id}: verify RED (attempt ${attempt}, exit ${build.verifyExitCode ?? '?'})`)
      continue
    }
    log(`slice ${slice.id}: red proven, revert-check passed, verify green (attempt ${attempt}) via \`${build.testCommand}\``)

    const gate = shouldReview(slice, build.changedPaths, index)
    const alreadyCommitted = build.committed === true

    if (!gate.review) {
      if (!alreadyCommitted) {
        lastReasons = ['builder did not self-commit despite review not being required — treating as a failed attempt']
        log(`slice ${slice.id}: expected self-commit but none happened (attempt ${attempt})`)
        continue
      }
      confirmed = true
      sha = build.sha ?? '(unreported)'
      log(`slice ${slice.id}: self-committed, review not required (${gate.why})`)
      continue
    }

    log(`slice ${slice.id}: review REQUIRED (${gate.why})`)
    phase('Confirm')
    const verdict = await agent(
      `Slice "${slice.id}" passed \`${sliceVerify}\` and its own revert-check. Its tests were proven RED before ` +
        `implementation (red command: \`${build.testCommand}\`). Inspect its diff: if the working tree has ` +
        `uncommitted changes, use \`git diff\`; if it was already committed (sha ${build.sha ?? '?'}), use ` +
        `\`git show HEAD\`. Judge ONLY whether its tests are honest. confirmed=true ONLY if the tests drive the ` +
        `feature through its REAL interface (not vacuous stubs), every required matrix row (${slice.matrix.join('; ')}) ` +
        `has a real test, the acceptance ("${slice.acceptance}") is actually asserted, and the tests were NOT ` +
        `weakened/gutted to force a pass. Be adversarial — catch green-but-broken. Otherwise confirmed=false with ` +
        `specific reasons.`,
      { agentType: 'argo:reviewer', label: `confirm:${slice.id}#${attempt}`, phase: 'Confirm', schema: VERDICT },
    )

    if (verdict?.confirmed) {
      if (alreadyCommitted) {
        confirmed = true
        sha = build.sha ?? '(unreported)'
      } else {
        phase('Land')
        const landed = await agent(
          `Commit the CONFIRMED slice "${slice.id}" and nothing unrelated. Stage ONLY this slice's source and test ` +
            `files — never graph artifacts (do not stage anything under a graphify-out/ directory). Write a concise ` +
            `conventional-commit message (goal: ${slice.goal}), commit with the repo's own git identity and signing. ` +
            `Do NOT push. Report the commit SHA.`,
          { agentType: 'argo:builder', label: `land:${slice.id}#${attempt}`, phase: 'Land', schema: LANDED },
        )
        confirmed = true
        sha = landed?.sha ?? '(unreported)'
      }
      log(`slice ${slice.id}: CONFIRMED (attempt ${attempt})`)
    } else {
      lastReasons = verdict?.reasons?.length ? verdict.reasons : ['confirm step was skipped or returned nothing']
      if (alreadyCommitted) {
        await agent(
          `Undo the last commit so a retry starts clean. Run EXACTLY: \`git reset --hard HEAD~1\`. Then report "reset".`,
          { label: `undo:${slice.id}#${attempt}`, phase: 'Confirm', model: 'haiku', effort: 'low' },
        )
      }
      log(`slice ${slice.id}: REJECTED (attempt ${attempt}): ${lastReasons[0]}`)
    }
  }

  if (!confirmed) {
    row.status = 'blocked'
    row.result = (lastReasons[0] ?? 'blocked').slice(0, 200)
    results.push({ id: slice.id, status: 'BLOCKED', attempts: attempt, lastReasons })
    await publishProgress(rows, `BLOCKED at ${slice.id} after ${attempt} attempts — ${confirmedCount}/${slices.length} confirmed.`)
    log(`slice ${slice.id}: BLOCKED after ${attempt} attempts — surfacing, not committing`)
    break
  }

  confirmedCount++
  row.status = 'done'
  row.result = `\`${sha.slice(0, 10)}\``
  results.push({ id: slice.id, status: 'DONE', attempts: attempt, sha, redProven: true })
  await publishProgress(rows, `${confirmedCount}/${slices.length} slices confirmed.`)
}

// One advisory review over the whole run's diff, once, at the end.
const doneCount = results.filter((r) => r.status === 'DONE').length
let finalReview = null
if (doneCount > 0) {
  phase('Final Review')
  finalReview = await agent(
    `This run landed ${doneCount} slice(s) as the last ${doneCount} commit(s) on this branch. Review ` +
      `\`git diff HEAD~${doneCount}..HEAD\` (and \`git log -${doneCount} --oneline\` for context) as ONE combined ` +
      `change. Each slice was already individually verified and (where risk-flagged) reviewed — you are looking for ` +
      `what only shows up ACROSS slices: architectural drift, a contract two slices individually satisfy but jointly ` +
      `violate, duplicated logic that should have been shared, or anything a per-slice view could not see. ok=true ` +
      `unless you find a real, specific, merge-blocking cross-slice issue.`,
    { agentType: 'argo:reviewer', label: 'final-review', phase: 'Final Review', schema: FINAL_VERDICT },
  )
  if (!finalReview?.ok) {
    log(`final review: findings — ${finalReview?.findings?.join('; ') ?? '(review skipped or returned nothing)'}`)
  }
}

const blocked = results.find((r) => r.status === 'BLOCKED')
return {
  plan: planPath,
  progress: progressPath,
  done: results.filter((r) => r.status === 'DONE').map((r) => r.id),
  blocked: blocked ? { id: blocked.id, reasons: blocked.lastReasons } : null,
  finalReview: finalReview ? { ok: finalReview.ok, findings: finalReview.findings ?? [] } : null,
  results,
}
