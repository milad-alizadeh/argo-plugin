# Migrate `@argohq/kit` to full TypeScript, compiled to a shipped `dist/`

Status: ready to build · Scope: `packages/kit/` in the argo-plugin repo only (plus
the two repo-root files that reference kit paths: `hooks/hooks.json`'s
`kit-dispatch.mjs` wrapper stays untouched — it resolves the kit's own `bin` field,
see below — and `vitest.config.ts`'s `include` glob). No changes to argo-v2 or any
other consumer repo.

## Decision already made (not re-litigated here)

Full TypeScript compiled to a committed `dist/` — not typed-JS (JSDoc + `checkJs` +
emitted `.d.ts` off `.js` sources). Reasoning: the CLI (`bin/argo.js`) and every hook
wrapper (`hooks/kit-dispatch.mjs` → `argo-hook <event>`) always invoke *compiled*
JS at runtime — they never execute a `.ts` file directly — so Node's inability to
run TypeScript natively is a non-issue once `dist/` exists and is current. See
"Rejected alternatives" at the bottom for the typed-JS path and why it lost.

## Grounding — what exists today

- `packages/kit/package.json:1-44` — `"type": "module"`, `"bin": {"argo": "bin/argo.js"}`,
  an `exports` map with 11 subpaths all pointing at `./src/**/*.js`, `"files": ["bin", "src", "!src/**/*.test.js"]`,
  no `types`, no `typescript`/`@types/node` devDependency, no `tsconfig.json` anywhere
  in the repo (confirmed: no `tsconfig*.json` glob hit under `packages/kit` or repo root).
  Runtime deps: `zod@^3.23.8`, `tdd-guard@^1.7.0`; optional peer `@playwright/test`.
- `packages/kit/bin/argo.js:1-139` — the single CLI entry. Dispatches `argo-hook <event>`
  via `spawnSync` against relative paths hardcoded as `'../src/hooks/*.js'`
  (`HOOK_CHAINS`, lines 20-31); dispatches `design <verb>` the same way (`DESIGN_VERBS`,
  lines 60-74); dynamically `import()`s `../src/cli/{init,update,doctor,graph-refresh}.js`
  for the lifecycle verbs (lines 102-134).
- `packages/kit/src/**` — 51 non-test `.js` modules across `cli/`, `config/`, `design-kit/`
  (+ `design-kit/recipes/`), `hooks/` (+ `hooks/lib/`), `lib/`, `recipes/shadcn-tailwind/`,
  `reporters/playwright/`, `skill-scripts/` (+ `skill-scripts/lib/`), `walkers/`, plus 42
  co-located `*.test.js` files (confirmed by `Glob`).
- **Every relative import already carries an explicit `.js` extension**
  (e.g. `src/design-kit/index.js:1` `from './comparator.js'`, `src/skill-scripts/emit-shims.js:20`
  `from '../config/argo-json.js'`) — this is exactly the specifier shape TypeScript's
  `NodeNext` module resolution requires from `.ts` sources (a `.ts` file importing a
  sibling `.ts` file must still write the `.js` extension). **No import specifier in the
  whole package needs to change during migration** — a huge risk reduction.
- **Self-referential path resolution depends on exact tree depth**, confirmed in two files:
  `src/cli/doctor.js:20` (`installedKitVersion` reads `../../package.json` relative to
  its own `import.meta.url`, i.e. two levels up from `src/cli/`) and
  `src/lib/repo-root.js` (git-toplevel resolution, depth-independent). A compiled
  `dist/cli/doctor.js` sits at the **same depth** as `src/cli/doctor.js`, so this keeps
  working only if the build preserves the source tree 1:1 (no bundling/flattening).
- **`packages/kit/bin/argo.js` is invoked directly, by hardcoded path, from the plugin's
  own checkout — before any install/build step runs**: `skills/init/SKILL.md:231`
  (`node "${CLAUDE_PLUGIN_ROOT}/packages/kit/bin/argo.js" init --host-root ...`, with the
  comment at line 234 confirming `npx --no -p @argohq/kit argo init` is the fallback
  *once* `bun install` has run — i.e. direct invocation is the FIRST call, pre-install).
  Two test files also load it by hardcoded relative path:
  `src/skill-scripts/emit-shims.test.js:17` and `src/cli/graph-refresh.test.js:17`
  (`fileURLToPath(new URL('../../bin/argo.js', import.meta.url))`).
- **`hooks/kit-dispatch.mjs`** (repo root, plugin-side, dependency-free by design per
  its own header comment lines 1-19) resolves the installed kit's `pkg.bin` field
  (`kit-dispatch.mjs:131` `install.bin?.argo ?? 'bin/argo.js'`) and `spawnSync`s that
  file directly — it never runs `npx`, never triggers a build, and is explicitly written
  to work "in a project where `bun install` has never run." It is untouched by this
  migration as long as `package.json`'s `bin` field keeps pointing at a real, already-usable
  file (see Approach).
- **`bun link` is the only distribution mechanism today** (dev phase, no publish yet):
  `test/preflight-bun-link-dep.md` records a verified run — `node_modules/@argohq/kit`
  is a **symlink to the real `packages/kit` directory**, and `bun install` in a consumer
  "does NOT install a linked package's own dependencies" (finding 1) — the kit's deps
  resolve via Node's directory walk-up from the plugin repo's own root `node_modules`.
  There is **no npm pack/install lifecycle step** in this path that could run a `prepare`
  script reliably for a symlinked consumer.
- **`packages/kit/src/skill-scripts/bundle-tier0-audit.js:118-145`** already shells out to
  `bun build --bundle --format=esm` to produce a Figma-sandbox-runnable script, resolving
  `@argohq/kit/design-kit/shadcn-tailwind/tier0-walker` from the **host project's**
  `node_modules` (comment lines 20-22). This is unaffected by the migration: it bundles
  whatever the exports map resolves to at the time it runs, which will be compiled `dist`
  JS post-migration — `bun build` already handles plain `.js` from `node_modules` today
  and will continue to.
- **`packages/kit/src/design-kit/no-recipe-imports.test.js:14-18`** is a source-hygiene
  test that walks the `design-kit` directory with `readdirSync(..., {recursive:true})`
  and filters `entry.name.endsWith('.js')` to check for forbidden recipe imports. Once
  `design-kit/*.js` files become `.ts`, this filter goes **silently vacuous** (checks zero
  files, always passes) unless updated — the exact "walker vacuity" failure mode this repo
  already guards against elsewhere (`.claude/plans/done/kit-extraction-restructure.md:397-400`,
  `walkerVacuity.test.mjs`). Must be fixed in the same step that migrates `design-kit/`.
- **`argo doctor` is a bidirectional version-equality lockstep check**, not a semver
  range: `src/cli/doctor.js:39-56` compares `majorMinor(manifest.designLibrary)` — read
  from `.claude-plugin/plugin.json`'s `"designLibrary"` field, currently `"0.1"` (a field
  distinct from that same manifest's own top-level `"version"`, currently `"0.20.0"`,
  `.claude-plugin/plugin.json:3`) — against `majorMinor(installedKitVersion())` (the
  kit's own `package.json` `"version"`, currently `0.1.1`). **Any version bump to the kit
  package must bump `designLibrary` in `.claude-plugin/plugin.json` in the same step**, or
  `argo doctor` fails loud.
- **Root `vitest.config.ts:14`** — `include: ['hooks/**/*.test.mjs', 'packages/**/*.test.{js,mjs}', 'eval/**/*.test.mjs', 'test/**/*.test.mjs']`
  and its own header comment (lines 10-13) records the owner's 2026-07-06 ruling that
  every unit test lives co-located with its subject. Vitest already transpiles `.ts`
  test files via esbuild with zero extra config — only the `include` glob needs `ts`
  added to the brace group.
- **No `typescript`, `@types/node`, `tsconfig.json`, or build script exists anywhere in
  this repo today** (confirmed by `Grep`/`Glob`) — this migration introduces all of them
  from scratch.

## Approach

**Build tool: `tsc`, not `bun build`/`tsup`.** Reasoning:
- The package's `exports` map has 11 fine-grained subpaths, each resolving to one
  source file (not a handful of bundle entry points) — `tsc`'s default 1:1
  file-for-file emit matches this shape exactly with zero extra config (`rootDir`/`outDir`
  mirroring), whereas a bundler wants to be told about (and would need to keep in sync
  with) every one of those 11+ entry points.
- `tsc` emits `.js` **and** `.d.ts` **and** sourcemaps in one pass. `bun build` does not
  emit declaration files at all — a second tool (`tsc --emitDeclarationOnly`, or `tsup`
  wrapping esbuild + a separate dts step) would be needed regardless, so choosing `tsc`
  alone avoids a second moving part.
- `tsc`'s plain transpile leaves `import` statements as real module specifiers (`zod`,
  `tdd-guard`, node builtins) rather than inlining them — correct for a published
  library whose dependents should resolve those from their own `node_modules`, not get
  a vendored copy baked into `dist`.
- This does **not** touch `bundle-tier0-audit.js`'s own `bun build --bundle` call, which
  bundles a *consumer-side* temp entry file for the Figma sandbox — a completely
  different bundling job, still bun, still unaffected (see Grounding above).

**`dist/` is gitignored, not committed (REVERSED 2026-07-06, owner ruling).** The
original decision committed `dist/` so a cold marketplace checkout could run
`packages/kit/bin/argo.js` before any build — see Grounding, `skills/init/SKILL.md:231`.
That reason is real but only bites the **general-distribution** path (a stranger's fresh
plugin install running `argo init` before anything builds). It does **not** bite the
current phase: the sole consumer (argo-v2) resolves the kit via **`bun link`** — a
filesystem symlink to this checkout — so it runs whatever `dist/` the checkout currently
holds, which the dev-loop watch build keeps fresh. Committing `dist/` there only bought
git churn (208 generated files re-touched on every build).

So for the bun-link local phase, `dist/` is gitignored and produced three ways, each
covering a different entry:
- **Local dev:** `bun run dev` (`tsc --watch`) keeps `dist/` fresh over the linked
  checkout — the loop the owner asked for. `bun run build` is the one-shot equivalent.
- **Fresh clone / git-dependency install:** a `prepare` script (`bun run build`) rebuilds
  `dist/` on `bun install` in the kit's own repo, so a freshly-cloned checkout is usable
  without a manual build.
- **Published consumers:** `npm publish` packs `dist/` via `files: ["bin","dist"]` after
  `prepublishOnly` builds it (`publish.yml`, OIDC, on a `kit-v*` tag). `files` is
  gitignore-independent, so gitignoring `dist/` does not affect the tarball.

**The one path this gives up, consciously:** a cold marketplace install running
`argo init` from the bundled checkout's `bin/argo.js` before any build now has no `dist/`.
That is the trigger to flip `skills/init` from the bundled-checkout bin call to
`npx --no -p @argohq/kit argo init` (the published kit, dist in its tarball) — the
deliberate move from the bun-link phase to the published phase. Until that flip, treat the
bundled-checkout bootstrap as dev-machine-only.

**Stale-`dist/` failure mode and its guards.** If `src/*.ts` changes and `dist/*.js` is
not rebuilt before commit, every fail-closed path (`bash-pretooluse` → red-proof/trust
gates, `design-guard-stop`, `argo doctor`) silently runs **yesterday's logic** — on a path
whose entire design point is to fail closed on drift. Three guards, layered:
1. **Dev-loop watch build** (`bun run dev` = `tsc --watch --preserveWatchOutput` in
   `packages/kit`) — kept running while editing; rebuilds `dist/` within the same process
   lifetime as edits, so both direct source-repo work and any `link:`-based consumer
   (e.g. argo-v2's root `"@argohq/kit": "link:@argohq/kit"`) see fresh `dist/` within one
   `tsc` incremental-compile cycle. No relink/restart needed — `link:`/`bun link` is a
   filesystem symlink to the real `packages/kit` directory (verified in
   `test/preflight-bun-link-dep.md`), and every kit entry point is either freshly spawned
   (`spawnSync` in `bin/argo.js`) or freshly `import()`ed per invocation, never cached
   in a long-lived process.
2. **CI build+test gate** (`kit-ci.yml`): a CI job runs `bun run build` (strict `tsc`)
   then `bun run test` on every push/PR. Since `dist/` is no longer committed there is
   nothing to diff — correctness is guarded by the build compiling clean and the full
   suite passing against that build (several tests spawn the compiled CLI/hooks as real
   node subprocesses, so build must precede test). This replaces the old dist-parity gate.
3. **No stale-committed-`dist/` risk to guard against anymore** — because `dist/` isn't
   committed, there is no checked-in copy that can silently lag `src/`. Every path that
   runs `dist/` either watch-builds it (dev), `prepare`-builds it (fresh install), or
   `prepublishOnly`-builds it (publish), so the compiled output is always derived from
   current source rather than a possibly-stale commit.

**Tests migrate alongside their module, importing the sibling `.ts` source directly —
not `dist`.** Vitest already runs `.ts` test files with zero extra config (esbuild
transform, no `tsconfig` wiring needed for that). Importing source (not `dist`) keeps
the fast red-green loop instant (no build step between editing and re-running tests) and
matches this repo's existing pattern of tests sitting right next to what they test.
`dist` is exercised indirectly by anything that goes through `bin/argo.js` or the
package's `exports` map from **outside** the package — i.e. the existing
`emit-shims.test.js`/`graph-refresh.test.js` hardcoded-`bin/argo.js` tests and any future
"acid" test that spawns the real CLI — those already exercise the real dist-backed path
by construction (they shell out to `bin/argo.js`, not `import()` the module).

**`bin/argo.js` itself is NOT migrated to `.ts` and does not move.** It stays a
hand-written, plain-JS launcher at the exact path `packages/kit/bin/argo.js` that
`package.json`'s `"bin"` field, `skills/init/SKILL.md:231`, `emit-shims.test.js:17`, and
`graph-refresh.test.js:17` all hardcode. Its only change is repointing its internal
relative paths from `'../src/hooks/*.js'` / `'../src/cli/*.js'` to
`'../dist/hooks/*.js'` / `'../dist/cli/*.js'`. Keeping this one file as stable,
uncompiled JS means every hardcoded external reference to it keeps working untouched —
zero edits needed in `skills/init/SKILL.md` or `hooks/kit-dispatch.mjs`.

## Files to change

- `packages/kit/package.json` — add `typescript`, `@types/node`, `@playwright/test`
  devDependencies; add `tsconfig.json` reference is implicit; `exports` map repointed
  `./src/**/*.js` → `./dist/**/*.js` with `types` conditions; add root `"types"`; `bin`
  unchanged (`bin/argo.js`); `files` becomes `["bin", "dist"]`; add `"scripts": {"build", "dev", "prepublishOnly"}`; version bump.
- `packages/kit/tsconfig.json` (new) — compiler options per Type strictness below.
- `packages/kit/bin/argo.js` — repoint `HOOK_CHAINS`, `DESIGN_VERBS`, and the four
  `await import('../src/cli/*.js')` calls to `../dist/...`.
- `packages/kit/src/**/*.js` → `packages/kit/src/**/*.ts` (51 files, renamed + typed,
  in the migration order below) — no import specifier changes required anywhere.
- `packages/kit/src/**/*.test.js` → `packages/kit/src/**/*.test.ts` (42 files, renamed
  alongside their subject module).
- `packages/kit/src/design-kit/no-recipe-imports.test.js` — extend the `.js`-only
  filename filter to also match `.ts`.
- Root `/Users/milad/Developer/argo-plugin/vitest.config.ts:14` — add `ts` to the
  `packages/**/*.test.{js,mjs}` brace group.
- `.claude-plugin/plugin.json` — bump `"designLibrary"` in lockstep with the kit version
  bump (see doctor.js coupling above).
- `README.md` (repo root) — document `bun run build`/`bun run dev` for `packages/kit`
  contributors, per the pre-commit-reminder guard above.
- `.github/workflows/kit-dist-parity.yml` (new) — the CI dist-parity gate (no
  `.github/workflows/*.yml` exists in this repo today, confirmed by `Glob`).

## Migration order (leaf-first, suite green after every step)

Each step: rename `.js`→`.ts` (module + its co-located `.test.js`→`.test.ts`), add
minimal type annotations (params/returns; let `tsc` infer the rest), fix any type error
`tsc` surfaces, run the scoped test file(s), then the full suite.

1. **Toolchain skeleton** — `packages/kit/tsconfig.json`, `bun add -d typescript
   @types/node @playwright/test` (from `packages/kit`), `"scripts"` in
   `packages/kit/package.json` (`build`, `dev`). No source files touched yet.
   Verify: `cd packages/kit && bun run build` succeeds against an empty/near-empty
   `src/**/*.ts` set (or a single trivial `.ts` smoke file) — confirms the toolchain
   itself works before any real module moves. `testable: false`, `requiresLaunch: false`.

2. **Pure leaves — `design-kit/` non-walker logic**: `tier0-rules.ts`, `comparator.ts`,
   `conversion-table.ts`, `schemas.ts` (zod-typed), `waivers.ts`, `component-categories.ts`,
   `region-contract.ts`, `xml-metadata-adapter.ts`, `kit-inventory.ts`, then
   `design-kit/index.ts` (the barrel) and `design-kit/recipes/external-kit.ts`. Update
   `no-recipe-imports.test.js`'s filename filter to `entry.name.endsWith('.js') ||
   entry.name.endsWith('.ts')` in this same step (it scans this exact directory).
   Verify: `bun run test -- design-kit` green; `bun run build` clean;
   `bun run test -- no-recipe-imports` still asserts (not vacuously) by temporarily
   reintroducing a forbidden import in a scratch file and confirming the test fails,
   then reverting. `testable: true`, `requiresLaunch: false`.

3. **Recipe walker layer**: `recipes/shadcn-tailwind/tier0-rules.ts`, `tier0-walker.ts`,
   `index.ts`. Verify: `bun run test -- shadcn-tailwind`; `bun run build` clean.
   `testable: true`, `requiresLaunch: false`.

4. **`design-kit/tier0-audit.ts`** (orchestrator over the rules above). Verify:
   `bun run test -- tier0-audit`. `testable: true`, `requiresLaunch: false`.

5. **`walkers/spec-diff.ts`, `walkers/vrt.ts`, `walkers/index.ts`; `lib/repo-root.ts`**.
   Verify: `bun run test -- walkers repo-root`. `testable: true`, `requiresLaunch: false`.

6. **`config/argo-json.ts`, `config/merge-config-shape.ts`**. Verify:
   `bun run test -- config`. `testable: true`, `requiresLaunch: false`.

**— Checkpoint review here —** (halfway through the module count, and the last step
before the fail-closed hook layer and the CLI/skill-script layer that depend on
everything above). Confirm: `bun run build` produces a `dist/` whose subtree for every
module migrated so far mirrors `src/` 1:1; `git diff --exit-code -- packages/kit/dist`
after a clean `bun run build` (parity check dry run); full `bun run test` green.

7. **`skill-scripts/lib/write-design-json.ts`, then the 13 skill-scripts**
   (`capture-kit-inventory.ts`, `check-anti-recreation.ts`, `bundle-tier0-audit.ts`,
   `prepare-tier0-audit-options.ts`, `record-audit-receipt.ts`, `region-coverage.ts`,
   `record-coverage-receipt.ts`, `extract-region-contract.ts`, `extract-built-regions.ts`,
   `lint-contract-freeze.ts`, `capture-kit-corpus.ts`, `emit-shims.ts`,
   `record-spec-diff-receipt.ts`). Each keeps its `if (import.meta.url ===
   \`file://${process.argv[1]}\`)` CLI-guard block verbatim — only the file extension
   and type annotations change. Verify: `bun run test -- skill-scripts`; manually
   `node packages/kit/dist/skill-scripts/record-audit-receipt.js --record
   '{"componentNames":[],"violations":[]}'` from a scratch temp cwd after `bun run
   build`, confirm it still writes `design/audit-receipt.json` (matches the CLI-guard
   contract these scripts already document). `testable: true`, `requiresLaunch: false`.

8. **`hooks/lib/gate-block.ts`, then the 8 hook files**: `red-proof-gate.ts`,
   `trust-gate.ts`, `design-commit-gate.ts`, `design-coverage-gate.ts`,
   `format-on-write.ts`, `test-smell.ts`, `design-guard-record.ts`,
   `design-guard-stop.ts`. This is the fail-closed-critical layer — after this step,
   re-verify the fail-closed contract explicitly. Verify: `bun run test -- hooks`; then
   `bun run build` and manually pipe a synthetic PreToolUse Bash payload through
   `node packages/kit/dist/hooks/red-proof-gate.js` (and the other 3 in the
   `bash-pretooluse` chain) confirming exit codes match pre-migration behavior for both
   a passing and a deliberately-failing scenario. `testable: true`, `requiresLaunch: false`.

9. **`cli/init.ts`, `cli/update.ts`, `cli/doctor.ts`, `cli/graph-refresh.ts`**. Verify:
   `bun run test -- cli`; `emit-shims.test.js` and `graph-refresh.test.js` (which spawn
   the real `bin/argo.js`) green against the now-dist-backed CLI. `testable: true`,
   `requiresLaunch: false`.

10. **`reporters/playwright/PlaywrightReporter.ts`, `reporters/playwright/index.ts`**
    (typed against the `@types/node`/`@playwright/test` devDependencies added in step 1
    — if `tdd-guard` ships no bundled `.d.ts`, add a local ambient declaration
    `packages/kit/src/types/tdd-guard.d.ts` with `declare module 'tdd-guard'` rather than
    weakening `strict`; verify which is needed once `tsc` actually runs against this
    file). Verify: `bun run test -- PlaywrightReporter`. `testable: true`,
    `requiresLaunch: false`.

11. **`src/index.ts`** (root barrel, last — depends on everything). Verify:
    `bun run build` clean end-to-end, zero remaining `.js` files under `src/`
    (`find packages/kit/src -name '*.js'` returns nothing). `testable: true`,
    `requiresLaunch: false`.

12. **`packages/kit/bin/argo.js` repointed to `dist/`** (stays plain JS, per Approach).
    Update `HOOK_CHAINS`, `DESIGN_VERBS`, and the four dynamic `import()` calls from
    `'../src/...'` to `'../dist/...'`. Verify: full `bun run test`; manually run every
    `argo <verb>` subcommand once from a scratch cwd (`argo-hook bash-pretooluse` with a
    benign payload, `design record-audit-receipt`, `init --host-root`, `doctor
    --plugin-root`, `graph refresh`) confirming each still exits/writes as documented.
    `testable: true`, `requiresLaunch: false`.

13. **`packages/kit/package.json` finalized**: `exports` map repointed to `dist/*.js`
    with `types` conditions, `"types"` root field, `"files": ["bin", "dist"]`, version
    bump. **`.claude-plugin/plugin.json`'s `"designLibrary"` bumped in the same commit**
    (doctor.js's bidirectional equality check, see Grounding). Verify: `npx --no -p
    @argohq/kit argo doctor --plugin-root "$(pwd)"` reports lockstep ok (or the
    equivalent direct-path invocation used pre-`bun link`-registration);
    `bun run test`; re-run the `bun link` preflight from `test/preflight-bun-link-dep.md`
    (register + scratch consumer + wrapper-path invocation) to confirm the whole
    published-surface contract still holds against `dist/`.

14. **Root `vitest.config.ts:14`** — add `ts` to the test-file brace group; **CI
    dist-parity job** added (`.github/workflows/kit-dist-parity.yml`, new — `bun run
    build` + `git diff --exit-code -- packages/kit/dist`); README contributor note for
    `bun run dev`. Verify: CI job fails against a deliberately stale `dist/` (dry-run
    locally: edit a `.ts` file, don't rebuild, run the parity diff command, confirm
    nonzero exit), then passes after `bun run build`. `testable: true` (the CI check
    itself is a behavior to verify), `requiresLaunch: false`.

## Type strictness

- `strict: true` in `tsconfig.json` from day one — the package is small enough (51
  modules) that retrofitting strict mode later costs more than starting with it.
- `module`/`moduleResolution`: `NodeNext` for both — this is the only setting that
  matches an ESM Node package (`"type": "module"`) and correctly requires/accepts the
  `.js`-suffixed relative specifiers already used everywhere in `src/` (see Grounding).
- `target: ES2022` (Node's own supported baseline for a package with no stated
  `engines` field — confirmed no `engines` key exists in `packages/kit/package.json`
  today, so this migration should add one, e.g. `"engines": {"node": ">=20"}`, to make
  the `ES2022` target choice explicit and enforced rather than implicit).
- `declaration: true`, `declarationMap: true`, `sourceMap: true`, `outDir: "dist"`,
  `rootDir: "src"` — the 1:1 layout mirror the self-referential path resolution in
  `doctor.ts` depends on (see Grounding).
- `skipLibCheck: true` — avoids depending on the quality of third-party `.d.ts` files
  (relevant for `tdd-guard`, whose own type coverage is unverified — see step 10).
- No JSDoc type annotations were found to fold in — the files read during grounding
  (`doctor.js`, `bundle-tier0-audit.js`, `emit-shims.js`, `kit-inventory.js`,
  `repo-root.js`) carry prose block comments explaining rationale, not `@param`/
  `@returns` JSDoc tags — treat any encountered during migration as documentation to
  preserve verbatim above the new type-annotated signature, not as a type source.

## Version/release mechanics

- This is a plugin-repo-only change (per scope). Bump `packages/kit/package.json`
  `"version"` (currently `0.1.1`) and `.claude-plugin/plugin.json`'s `"designLibrary"`
  (currently `"0.1"`) **together, in the landing commit** — `argo doctor`
  (`src/cli/doctor.ts` post-migration) fails loud on any mismatch in either direction.
  Recommended: `0.1.1` → `0.2.0` (internal-only structural change, public API/behavior
  identical, but this repo's lockstep model cares about exact major.minor equality, not
  semver compatibility, so the specific number matters less than doing both bumps
  atomically) and `designLibrary` `"0.1"` → `"0.2"` to match.
- **`bun link` still works with a `dist/`-backed package** — `link:` is a filesystem
  symlink to the real `packages/kit` directory (verified in
  `test/preflight-bun-link-dep.md`); nothing about that mechanism cares whether the
  directory's runtime entry points are `src/*.js` or `dist/*.js`, only that `bin/argo.js`
  and the `exports` map targets exist and are current on disk — which committing `dist/`
  plus the watch build guarantees.
- No publish happens in this plan (dev phase, `bun link` only, per
  `test/preflight-bun-link-dep.md` finding 3) — `"prepublishOnly": "bun run build"` is
  wired now (matches this repo's existing pattern of wiring publish-readiness ahead of
  actually publishing, e.g. `publishConfig.access` already set, the OIDC workflow already
  planned in `kit-extraction-restructure.md` Slice 7) so the eventual first `npm publish`
  isn't blocked on remembering this step.

## Risks / open questions

- **`tdd-guard`'s own type coverage is unverified.** If it ships no `.d.ts` at all,
  `PlaywrightReporter.ts` (step 10) needs an ambient `declare module 'tdd-guard'` to
  typecheck under `strict`. Resolve empirically when `tsc` runs against that file — flag,
  don't pre-guess the fix.
- **No lefthook/pre-commit infrastructure exists in this repo today** (confirmed —
  `templates/lefthook.yml` is a host-project template, not wired here). The
  dist-staleness guard therefore relies on the CI parity job (step 14) as the sole
  automated backstop; a contributor who never runs CI before pushing to a branch that
  skips review could still commit a stale `dist/` locally. Introducing this repo's own
  lefthook setup is explicitly out of scope for this migration (would duplicate
  `argo:init`'s own lefthook-wiring logic against the wrong target); flagged, not fixed,
  here.
- **`bun link`'s interaction with lifecycle scripts is unverified.** `prepublishOnly`
  fires on `npm publish`, not on `bun link`/`bun install` for a `link:`-resolved
  dependency — this plan does not depend on that script firing for the dev-phase link
  path (dist is committed, so nothing needs to run at link time), but if a future
  release step assumes `prepublishOnly` alone keeps a `link:`-based consumer's `dist/`
  fresh, that assumption is wrong; the watch build (or a manual `bun run build`) is the
  actual mechanism during dev phase.
- **`packages/kit` currently has no `engines` field** (confirmed absent) — this plan
  recommends adding one (see Type strictness) as an incidental but load-bearing-adjacent
  change; flagged here rather than silently introduced, since it's a new constraint on
  consumers, not purely mechanical.
- **Test count given in the task description ("59 test files / 477 tests") was not
  independently re-verified against a live `bun run test` run** during this read-only
  planning pass (grounding here relied on `Glob`, which found 42 `*.test.js` files
  under `packages/kit/src` specifically — the task's larger number likely includes
  `hooks/**/*.test.mjs`, `eval/**/*.test.mjs`, and `test/**/*.test.mjs` files outside
  `packages/kit`, which this migration does not touch). Whoever builds this plan should
  run `bun run test` once before starting to record the real baseline count and confirm
  it stays identical (module-for-module) through every step.

## Rejected alternatives

**Typed-JS (JSDoc + `checkJs` + emit `.d.ts` off `.js` sources), rejected.** This would
have kept `src/**/*.js` as the literal runtime-executed files (no `dist/`, no build
step, no risk of stale-compiled-output drift) while still gaining type-checking via a
`tsconfig.json` with `allowJs: true, checkJs: true, emitDeclarationOnly: true` reading
JSDoc annotations. It lost because the deciding constraint — "the CLI and hooks always
invoke compiled JS at runtime, they never execute `.ts`" — cuts the other way just as
well for typed-JS (there's no `.ts` to fail to execute either way), but typed-JS is
strictly *less capable* for this codebase for two concrete reasons grounded in what's
actually here: (1) `design-kit/schemas.ts`'s zod schemas and the CLI report-shape types
threaded through `cli/{init,update,doctor,graph-refresh}.js` want real interfaces/generics
that JSDoc can express only clumsily; (2) the package's 11-subpath `exports` map is
exactly the shape that benefits most from per-file `.d.ts` generated straight from real
`.ts` syntax rather than reverse-engineered from comments. Once the owner ruled for full
TS, this alternative was dropped rather than kept as a fallback.
