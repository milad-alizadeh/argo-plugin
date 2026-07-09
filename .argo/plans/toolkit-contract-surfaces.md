# Toolkit contract surfaces (built with this change)

Plan-record for the host-app contract surfaces required by argo-v2's
`playbooks-and-runs.md` PRD (RUNS-R24 / RUNS-R27). This is
built-with-this-change documentation, not a queued plan.

## What shipped

1. **`argo playbook list --json`** (RUNS-R24)
   - `listPlaybooks()` added to `packages/toolkit/src/core/spec.ts` (registry enumeration).
   - `packages/toolkit/src/cli/playbook-list.ts`: pure `buildPlaybookCatalog` +
     `runPlaybookList` (imports pack-design's playbook barrel to populate the
     registry). Emits name/slug, `displayName` (interim rule: slug → sentence
     case, hyphens → spaces, until specs grow an authored display field),
     pack (identity-attributed to pack-design), version, per-stage specs with
     `gate` names, and the `playbookStart` input contract (`target` required,
     `key` optional).
   - Version provenance: specs carry no version field, so `version` is the
     installed @argohq/toolkit package version, stamped
     `versionSource: "toolkit-package"`.
   - Wired into `bin/argo.js` (`playbook list`).

2. **`argo design sync --check --json`** (RUNS-R27)
   - `packages/toolkit/src/packs/design/skill-scripts/sync-check.ts`:
     deterministic, registry-scoped, no LLM. Sweeps ADOPTED surfaces hard
     (custom + `adopted: true` kit; raw kit advisory-skipped; screen /
     code-owned exempt). Findings: `invalid-registry-entry`, `missing-spec`,
     `orphan-spec`, `spec-diff-receipt` (absent or failing). Exit 0 clean /
     1 dirty; JSON is the only format.
   - **Stated limitation** (in `--help` and every report's `limitation`
     field): a CLI cannot assume live Figma access, so the check runs against
     the LAST-SYNCED COMMITTED `design/` artifacts. Human hand-edits in Figma
     since the last figma-sync are invisible until a sync lands them.
   - Wired as `sync` in `bin/argo.js`'s DESIGN_VERBS.

3. **adapter-claude contract exports**
   - `packages/toolkit/src/adapter-claude/contract.ts`, exported from the
     barrel (the `./adapter-claude` subpath export with `types` already
     existed in package.json — verified; `.d.ts` ships via `tsc` build).
   - `RUN_STATES` (`in-progress`/`stuck`/`done` — verbatim engine statuses),
     `PLAYBOOK_LIFECYCLE_EVENTS` (`playbook_started`/`playbook_finished`/
     `stage_started`/`stage_finished`), `TOOL_NAMES`
     (`Agent`/`Task`/`Workflow`), `LIFECYCLE_STATUSES`
     (`async_launched`/`completed`), plus their union types.
   - Contract-freeze test asserts every value literally.

4. **Repo housekeeping**
   - `.claude/plans/` → `.argo/plans/` and `.claude/design/` → `.argo/design/`
     migrated; `.gitignore` switched from blanket `.argo/` to the same
     deny-by-default block `runInit` seeds (`/.argo/*` + re-includes for
     `config.json`, `plans/`, `design/`).
   - Doc pointers in `packages/toolkit/src` (gate.ts, spec.ts, core/index.ts,
     packs/design/index.ts, adapter-claude/index.ts,
     playbook-permission-gate.ts, config/argo-paths.ts) and README's
     kit-typescript-migration link updated to `.argo/` paths.
   - `skills/init/SKILL.md` §6d stale `packages/kit/bin/argo.js` →
     `packages/toolkit/bin/argo.js`.

## Deferred

Follow-up pass (same change, leftovers round):

- **Lifecycle event EMISSION shipped**: names moved to `core/events.ts`
  (engine-owned; `adapter-claude/contract.ts` re-exports as the stable host
  import surface). `playbookStart` returns `events` (`playbook_started` +
  first `stage_started`); `playbookAdvance` returns `stage_finished` +
  `stage_started`/`playbook_finished` on a pass, `[]` on a failing verdict
  (retry/stuck rides `status`). Events are call-scoped, never persisted.
  `playbookAdopt` still emits nothing (its bulk-catch-up semantics need an
  owner call on per-stage vs summary events).
- **Authored displayName shipped**: optional `displayName` in
  `PlaybookSpecSchema`; all six pack-design playbooks carry verb-first pretty
  names ("Create screen", "Edit component", …); catalog derivation is now
  only the fallback.

Deferred (deliberate, not TODO):

- **Per-playbook semver**: conflicts with the settled no-version-handshake
  decision — specs stay unversioned shape data; catalog entries ride the
  toolkit package version.
- **Value-level comparator sweep in sync --check**: comparing committed Figma
  token/spec values against rendered code styles needs a DOM (that IS the
  spec-diff walker); the headless check consumes the walker's recorded
  receipt instead of re-running it.
- **`.claude/plans/playbook-rename-phase2.md`**: item 7 has landed but the
  permission classifier blocks this session from moving the file (declared
  hands-off while another session appended to it). One manual step remains:
  `mv .claude/plans/playbook-rename-phase2.md .argo/plans/ && rmdir
  .claude/plans`. Doc pointers already reference the `.argo/` path.
