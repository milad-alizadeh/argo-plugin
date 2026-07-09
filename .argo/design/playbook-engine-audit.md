# Argo playbook engine — design audit

Scope: `playbook-engine.md` plus the design and code playbook fixtures. Findings below survived adversarial verification and are stated at their refined severity, not their first-pass severity. Several first-pass "critical" items turned out to have cheap, in-character fixes; that is reflected in where they land and how they are scoped.

The through-line: the architecture is sound, but three areas need a decision before the planner locks the schema. First, the permission model enforces action *kinds* but never *paths*, so the machine trust surfaces (state, config, git history, the test suite) an agent can edit to fake a passing gate are currently unprotected. Second, two seams are named but not specified (how an AI gate gets a judging session; how a spec expresses a runtime fork). Third, the doc claims the diagram generator round-trips fixtures it cannot actually produce. None of these require new subsystems. Most are one rule added to a hook the design already has, or one sentence that closes a seam.

---

## 1 · Must-fix before implementation

### 1.1 Protect the machine trust surfaces by path, not just by action kind

Merges the state-file, config-file, and (partly) suite-composition findings — they share one root cause.

**The gap.** Permissions are scoped only by action kind (`file-edit`, `git-commit`, etc.), never by target path. Nearly every stage allows `file-edit`. So a working agent can edit files that are supposed to be engine-or-human-only:
- `~/.argo/state/<project-id>/playbooks/<key>.json` — flip `status` to `done`, forge a passing `attempts[]` entry, or blank `findings` before the real gate runs. The doc calls this "written by the engine and gates only," but that is a convention, not a control.
- `.argo/config.json` and `probity.config.ts` — relax `testDiscipline`, add a `noPlaybook` allow-path, or gut a Probity rule. Depending on whether config is read live per hook-call or cached at session start, this can weaken enforcement inside the very same stage.
- `workspaces/*/registry.json`, `manifests/`, and other machine-owned `.argo/` artifacts a gate later trusts.

**Why it matters.** The whole "foolproof gates" promise rests on the agent not being able to edit the record that decides whether it passed. Right now it can. This is the highest-leverage hole in the design because it defeats every downstream gate at once.

**The change.** Add a core-owned protected-path list that the existing generic PreToolUse hook denies for the working-agent role unconditionally, evaluated *before* the stage's `allows` list, regardless of stage. Default set: everything under `~/.argo/state/**`, `.argo/config.json`, `probity.config.ts` (note: this one sits at repo root, outside `.argo/`, so an "ownership of `.argo/`" rule alone misses it), and the machine-written artifacts (`registry.json`, `manifests/`). The only write path for config is a human hand-edit outside a session or an engine command; the only writer of state is the engine/gate process, which runs as the `argo` CLI and never passes through the interactive tool surface, so no separate auth principal or process identity is needed. Do not build a distinct-principal sandbox — that is disproportionate for a local single-user tool. This lives in core, so a future Codex adapter inherits it for free. Also settle in the doc whether config is read live or cached, since that determines the blast radius of a same-stage edit.

### 1.2 Deny destructive git operations by default

**The gap.** The action-kind vocabulary lists `git-commit` but nothing for `git reset --hard`, `git commit --amend`, `git rebase`, or `git checkout -- <path>`. By the classifier's fail-open rule ("unclassified → allowed"), all of those are permitted in every stage. An agent under `tests-stay-green` (refactor) or `reproduce-first` (bug-fix) can `git checkout -- tests/` to silently revert a Probity-tracked failing-test edit, or `git commit --amend` to erase a red-test commit before `tests-pass` inspects history.

**Why it matters.** These policies depend on the commit/test history they are checking. History rewriting quietly removes the evidence, so the gate passes on a fabricated timeline.

**The change.** Add one core action kind (plain name, e.g. `git-history-mutation`) covering reset, amend, rebase, checkout of tracked paths, and filter-branch, classified by the adapter's existing git-command-string parser, and denied by default unless a stage's `allows` opts in — no stage in the six code playbooks needs it. Drop the recommendation's second half (assert working-tree/test-file hashes against what Probity observed): a hash-pinning layer parallel to Probity is complexity the simplicity requirement resists, and deny-by-default plus `tests-pass` re-running the suite already closes the exploit. Worth one sentence in the doc: the classifier's fail-open rule is only safe *because* destructive, irreversible kinds are explicitly enumerated and denied — otherwise "the enforcer only narrows what it understands" silently permits anything a future tool surface exposes.

### 1.3 Pin what "the suite" is, so editing test config can't game `tests-pass`

**The gap.** `tests-stay-green` forbids content-pattern edits to test files but says nothing about runner config (`vitest.config`, `playwright.config`, the `package.json` test script, coverage/include globs) or about deleting/renaming a whole test file — a delete is not a content edit to an existing file, so `forbidContentPattern` never fires. Since `file-edit` is unscoped, an agent can narrow the runner's `include`, exclude a failing file, or delete a test, and then `tests-pass` "runs the suite itself" and passes on a hollowed suite while genuinely believing it is the same suite.

**Why it matters.** This bites hardest in the review-less playbooks (refactor, small-change, style-change), where no blind reviewer sees the diff. `tests-pass` is the only floor there, and it is spoofable.

**The change.** Extend the existing Probity policies rather than adding new machinery. Widen `tests-stay-green`'s protected surface to also deny (a) deletion/rename of test files and (b) edits to suite-scoping runner-config paths, and apply the same runner-config protection to `small-change`'s `tests-pass` path. This is adding paths and action kinds to a policy that already exists. Drop the baseline-snapshot idea (capture test-file count/hashes at stage entry, plus a "gated remove-test" action) — that is stateful, cuts against blind stateless gates, and over-builds for phase 1. Legitimately removing a test then becomes an explicit small-change or refactor decision, not a silent edit inside a green-keeping stage. One sentence in the doc; leave exact globs to the planner.

### 1.4 Give AI-judging gates a non-circular way to obtain a session

Merges the two "gate agent-spawn is unspecified" findings.

**The gap.** `Gate.check(input)` is pure data-in, but `fresh-eyes-review`, `code-matches-design`, and `code-review` are blind AI judges that must spawn their own judging session (the migration map calls this "agent-spawn in adapter"). Pack gate code depends on core only, never on `adapter-claude`, so a pack-owned gate cannot itself spawn a Claude Code session. As written this is either a silent dependency-direction violation (the pack secretly imports the adapter) or a missing abstraction. It is also the seam that makes these gates provider-swappable at all.

**Why it matters.** Without a named seam, the first person to implement `fresh-eyes-review` either reaches into `adapter-claude` from a pack (breaking the dependency rule the whole package structure rests on) or invents an ad-hoc mechanism. It also blocks the second-provider promise: a Codex adapter has nothing concrete to reimplement.

**The change.** Add one narrow core capability — e.g. `core.judge(spec) → verdict-shaped result` — that the active adapter registers at startup and that spawns a fresh, blind session fed only artifact URIs, never the working transcript (which is exactly the anti-reward-hack invariant these gates already require, and lets core enforce blindness centrally since the dispatch path only accepts URIs). Pass it to gates as a context argument alongside `GateInput`, so the gate calls `ctx.judge(...)` and never imports `adapter-claude`. Deterministic gates (`tests-pass`, `design-rules-check`, `plan-check`) ignore it. State this next to the Gate interface and reword the migration-map cell from "agent-spawn in adapter" to "calls `core.judge`, implemented by the adapter." This is the same shape as the adapter-owns-the-classifier seam — one added interface, not a new layer.

### 1.5 Decide how runtime forks are expressed, and stop claiming the generator round-trips them

Merges the "conditional stages have no spec field" and "diagram generator can't render its fixtures" findings. This is the one item that must be settled before the schema locks, even though the fix is mostly clarification.

**The gap.** Nearly every design playbook branches on a runtime predicate: screen-create's "Missing components?", component-create/edit's "Code-owned?", component-create's "Exists?" short-circuit. The spec vocabulary (`requires / produces / allows / policy / gate / skill / session / retries / repeat / maxRounds`) has no branch field; stages are a flat list. These forks change which stage runs next, which `retries`/`maxRounds`/`repeat` cannot express. Separately, the doc says the hand-drawn diagrams *are* the generator's acceptance fixtures, but those fixtures contain decision diamonds, human-gate nodes, and pack-conditional edges the described generator (flat stage list in) cannot produce. The two claims contradict each other.

**Why it matters.** If the schema locks without resolving this, either the forks get bolted on later as an incompatible change, or someone builds a general branch DSL — which turns data specs into a mini programming language and fights the "simplicity, no jargon" requirement head-on.

**The change.** Do not add a general `branch: { on, cases }` / `skipIf` / `nextIf` DSL. Instead:
- State that same-convergence data forks ("Code-owned?", "Exists?") are resolved *inside* a stage's skill by reading metadata truth (the `@code-owned` annotation, the registry), not by a spec-level branch. This keeps that domain logic out of provider-agnostic core and needs no schema change.
- Add the one genuinely load-bearing engine mechanism: cross-playbook dependency resolution — a stage that `requires` another component's or playbook's output triggers the engine to spawn the prerequisite playbook first ("Missing components?" is this, not stage branching), plus an early-`done` exit when a guard finds the work already exists ("Exists? Stop.").
- Scope phase-1's `argo playbook diagram` to the linear skeleton specs can actually emit (stages, gates, retry/fix loops, `repeat`), redraw the fixtures to match, and drop the stale human-gate ship/accept nodes so the drawing stops contradicting the settled "no human gate" decision. Reword line ~76 from "the hand-drawn diagrams are the generator's acceptance fixtures" to something like "the generator emits the spec-expressible skeleton; runtime-decision diamonds and prose live outside the spec and are not round-tripped."

---

## 2 · Should-fix

### 2.1 `adopt` should re-verify a boundary, not trust an artifact's presence

`argo playbook adopt` re-derives stage from "artifacts/Figma reality," which reads as presence-based. After a crash or manual work, a fabricated or copied artifact at the expected `produces` path (an old passing `manifest.json`, an unrelated screenshot) would advance the playbook as if the gate had passed. Fix: adopt walks stages in order and re-runs each stage's declared gate against the discovered artifacts, setting the current stage to the highest contiguously-passing one. Gates are already blind and artifact-only, so this costs about one gate run and adds no design complexity. The danger is concentrated at adopting *into or past* a gated boundary; resuming mid-stage before that stage's exit gate is inherently safe because the gate still fires. Gates that read the live external surface (`design-rules-check` reads Figma, `tests-pass` runs the suite) are already spoof-resistant; the hole is file-path artifacts. For genuinely un-re-runnable gates, record `verified: false` provenance in `history` and surface it in `argo playbook status` rather than silently advancing.

### 2.2 State that comparison gates capture their own render

`fresh-eyes-review` and `code-matches-design` compare a screenshot to Figma, and `GateInput.artifacts` is a `Record<string, URI>` that a working agent's `produces` output can populate. If the gate consumes an agent-supplied image URI, the agent can hand it a doctored or stale screenshot and pass a gate meant to be adversarial. The design already bans self-report evidence for `design-rules-check` and `tests-pass` but does not say it for the screenshot gates, where an agent artifact is type-indistinguishable from gate evidence. Fix is a one-sentence contract tightening, no new machinery: any gate whose evidence is a live render captures that render itself at check time (fresh app launch / `get_screenshot`) and never accepts a working-agent image URI as the thing under test; only the reference (Figma) side may come from an external source. Keep the capture mechanism in the adapter/pack so core stays provider-agnostic.

### 2.3 Say what in-flight enforcement degrades to on providers without a pre-execution hook

The permission model is built on a Claude Code `PreToolUse` hook. Codex CLI exposes approval modes, not a hook API; some Copilot surfaces expose only post-hoc diffs. So "a Codex adapter reimplements only the classifier + hook" understates the case for providers that have no pre-execution interception point at all. This is a framing/honesty gap, not a structural hole — the blind stage-exit gates already carry the portable enforcement floor. Fix: add a degradation line to the Stage-permissions and Named-stage-policies sections stating that in-flight `allows`/`policy` is a narrowing safety-and-coaching layer, not a correctness guarantee; on a provider without a pre-execution hook it degrades to gate-only (no live denial, no coaching before the tool runs), and the blind gates remain the enforcement floor. Flag the one place the guarantee genuinely depends on interception: read-only stages like bug-fix DIAGNOSE, which would need a gate-side "diagnose produced no code edits" assertion to stay foolproof cross-provider. Soften "permissions make violations impossible" to "on Claude Code, permissions make violations impossible in-flight; elsewhere the gates catch them at stage exit."

### 2.4 Refuse a cross-pack playbook at start when the required pack is disabled

pack-design's `design-to-code` (playbook no.5) hands off to pack-code's `screen-implement`; if pack-code is disabled while pack-design is on, there is no stated behavior and the playbook would fail mid-run at the handoff. This does not violate "packs depend on core only" — pack-design references `screen-implement` by name through core's shared registry, which is the sanctioned soft-seam mechanism — but the missing guard is real. Fix as a single general engine rule stated once in the packs-are-optional section: a playbook whose terminal stage hands off to a disabled pack is refused at `argo playbook start` with a config error naming the missing pack, rather than failing at the handoff. Stated generally, it covers every present and future cross-pack seam symmetrically, matching the single-rule simplicity ethos. Note that `design-to-code` is inherently code-producing, so a design-only project simply should not enable or invoke it.

---

## 3 · Accepted risk / fine as-is

### 3.1 `figma-*` in the core action-kind list

The `allows` vocabulary example lists `figma-read`/`figma-write` alongside generic kinds like `file-edit`, which technically gives core permanent knowledge of Figma as a concept. In practice this is a wording issue, not a structural one, and the cheapest resolution is a net simplification rather than a new registry: describe action kinds as an open, pack-extensible vocabulary of plain strings, where core does a string-equality membership check between the classifier's output and the stage's `allows` and never enumerates the domain-specific kinds itself. The design vocabulary (`figma-*`) then lives implicitly in pack-design specs and the adapter's classifier (which is already domain-aware and provider-specific), keeping core domain-neutral. Do not build a pack-registered action-kind registry — that adds ceremony and still would not stop the adapter classifier from knowing Figma. One-line doc edit, only worth doing when the section is next edited. Left as accepted-risk because either phrasing ships safely.

---

## Verdict

The architecture is sound enough to hand to the planner, with one condition: items 1.1 through 1.5 are resolved in the doc first, because they touch the schema and the permission model that everything else hangs off, and retrofitting them after the schema locks would be an incompatible change. None of them is a redesign. The permission fixes (1.1–1.3) are all one path-class-deny or one action-kind added to a hook the design already has. The two unspecified seams (1.4 gate judging, 1.5 runtime forks) close with one narrow core capability and one clarification that forks live inside a stage's skill plus a cross-playbook spawn mechanism — both smaller than the general subsystems the first-pass findings reached for, and truer to the owner's simplicity and provider-abstraction requirements. The core insight of the design — passive spine, blind artifact-only gates, data specs, adapter-owned classifier, fresh/warm/retry sessions — holds up under adversarial review and is the right spine to build on. The gaps are all "the trust boundary is documented as a convention but not yet enforced as a control," which is exactly the class of thing to nail down on paper before code, not after.