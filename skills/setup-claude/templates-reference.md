# setup-claude — template instantiation reference

How to instantiate each template under `${CLAUDE_PLUGIN_ROOT}/templates/rules/`
into the host project's `.claude/rules/`. For each accepted template: fill every
explicit `{{…}}` slot (e.g. `{{LOCKFILE}}`, `{{LINT_CMD}}`) from the detected
values, set a `paths:` glob matching THIS project's real layout
(never ship an unscoped rule), and on a non-TS project write the
language-appropriate equivalent instead.

| Template | Install when | Substitute / scope with |
|---|---|---|
| `design-system` | a styling system + token source exist | real token source path; styling-file globs for this repo |
| `ui-components` | a component dir + UI framework exist | the real components dir; the project's primitive library |
| `testing` | a test runner exists | real e2e tool + the project's `lint`/`test` commands; enumerate the project's test env flags (see below) |
| `file-structure` | always (greenfield) / on request (brownfield) | the project's **observed** naming + folder convention (don't impose Argo's) |
| `typescript-style` | project is TypeScript | scope to `**/*.{ts,tsx}` |
| `dependencies` | always | the project's package manager + manifest **and lockfile** paths |

**Testing rule — enumerate env flags by exact name.** The template's "Environment
flags" section is a placeholder for THIS project's real flags. Grep the e2e
config/fixtures/main entry for `process.env.*` (or the language's equivalent) and
list each test-relevant flag **by its exact name** with a one-line role (fake/replay
switch, DB/persistence isolation, e2e mode, transcript/cassette path, …), including
any near-miss-name gotchas. A generalized paraphrase ("use a fake flag") loses the
part agents actually need — the names. (Observed in dogfooding: the adapted rule
dropped a load-bearing four-flag section the hand-tuned original had.)

**Brownfield conflicts:** if a template contradicts observed reality (e.g. many
files use inline styles vs the design-system rule), say so and offer
aspirational-for-new-code or skip — never auto-impose.

**Convention hooks (optional):** a convention-enforcement hook (e.g. a design-token
guard) goes into the project's own `.claude/` + `settings.json` `PostToolUse` with
detected paths baked in — never into the plugin's always-on `hooks/`.
