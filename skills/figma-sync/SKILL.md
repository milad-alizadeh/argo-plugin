---
name: figma-sync
description: Dump the Figma design source of truth into committed artifacts — tokens, the semantic token manifest, specs, story-map, reference screenshots, freshness metadata — regenerate the generated CSS region, and commit. Use when the user asks to sync/pull/import the latest Figma changes, before figma-to-code generation needs fresh design context, or on a schedule after Figma edits.
---

# figma-sync

Pulls the Figma design source of truth into the **committed artifacts** every
deterministic gate compares against (design-pack plan §4) — no gate ever
talks to Figma directly, including during hands-off `build-plan` runs (C6).
Builds on `figma:figma-use`.

**Source of truth (one rule, every component).** Figma owns ALL visuals —
tokens, variants, spacing, styling — for every component, base or custom,
one-way Figma→code. Code owns ALL behavior — a11y, focus, state machines,
base-ui/react wiring. Sync regenerates the presentation module only; it never
touches the hand-owned behavior file (the generated-presentation/hand-owned-
behavior split — see `figma-to-code`'s presentation-regen seam).

**Scope: custom + code-owned + ADOPTED kit only (directive 3 refined,
2026-07-08).** A `kind: 'kit'` master is stock library content. Only kit a
project surface actually **instances** (a custom/code-owned component or a
composed screen) is "adopted" — those are audited and synced like any authored
surface. **Raw (un-adopted) kit is the vendored mirror nothing uses: never a
hard-audit target, never a sync target, never auto-stamped `out-of-sync`** —
drift on it is advisory noise you report and ignore, not work. Adoption is
DERIVED from live instance usage (step 2c), never hand-flagged; it lands as the
optional `adopted: true` field on the registry entry, and `prepare-tier0-audit-
options` (via `resolveComponentNodeIds`'s `rawKitExemptNames`) drops un-adopted
kit from every audit set. This is the guardrail against the failure it was
written for: a staleness sweep flagging 110+ unused stock masters and an
operator promoting them into a sync/fix pass that then damages them.

## Procedure

1. **Audit first (hard gate, D8).** Call `figma-audit` on the components
   being synced. Any `hard` violation fails the whole sync loud — fix in
   Figma before syncing, never sync a dirty file.
2. **Dump tokens.** Full variable dump (collections, modes, values,
   descriptions) into `design/tokens.json`, plus freshness metadata: file
   version, `lastModified`, and this sync's timestamp (D4). All variables
   are LOCAL to the project's design file (the duplicated starter) — there
   is no separate kit file, no `kit.lock`, and no variable-key manifest to
   capture.
2a. **Regenerate the semantic manifest.** Run
   `argo design generate-token-manifest` — it derives
   `design/semantic-manifest.md` (~60 semantic token names + purposes) from
   the freshly dumped `design/tokens.json`. This is the authoring vocabulary
   LLM sessions bind against (instead of enumerating ~1800 local
   primitives); commit it with the other artifacts in step 9. Never
   hand-edit it — the CLI is its one writer.
2b. **Staleness sweep (design doc decision 8).** Layered staleness check
   against the committed `design/registry.json`: file-version bump (from
   step 2's freshness metadata) → a shallow diff of the freshly dumped
   `design/tokens.json` against the previous snapshot (`diffVariableDefs`) →
   a live node-id walk (`get_metadata`/`use_figma`) vs. every registry
   entry's `nodeId` (`classifyNodeDrift`) → `classifyStaleness` combines the
   three into `in-sync`/`presentation-drift`/`api-drift`/`orphaned` per
   entry (kit's `design-kit/staleness` module — all pure functions, no
   `figma.*` calls; this skill gathers the live snapshots). Stamp each
   affected entry's `lastSyncedAt`/`status` in `design/registry.json` —
   **but gate every stamp through `stalenessActionability(entry,
   classification)` (kit's `design-kit/staleness`): a raw (un-adopted) kit
   master that drifts returns `advisory` and MUST NOT be stamped `out-of-sync`
   or enter any sync/audit set — only `actionable` entries (adopted kit,
   custom, code-owned) get the `out-of-sync` stamp.** End with a
   **review-prompt printout** split in two: `actionable` drift (the real
   review list) and `advisory` raw-kit drift (report count, then ignore) —
   advisory, never a gate: auto-regen on sync is explicitly out of scope
   (design doc "Rejected alternatives").

2c. **Derive kit adoption (directive 3 refined, 2026-07-08).** In the SAME
   combined `use_figma` walk as 2b (no extra round-trip), for every project
   surface — each `custom`/`code-owned` registry component and each composed-
   screen page (`isDesignPageName`) — collect every `INSTANCE.mainComponent`
   id AND its parent `COMPONENT_SET` id (a registry kit `nodeId` is usually
   the set; an instance resolves to a child variant, so gather both). Pass
   that id set + the registry to `deriveAdoption` (import from
   `@argohq/kit/design-kit`); stamp `adopted: true` on each returned kit
   entry and **clear it** on any kit entry no longer instanced (adoption is a
   live fact, re-derived every sync, never sticky). This is what moves a kit
   master into audit/sync scope — a component you adopt by instancing it in
   your work, not by hand-flagging.

   **Registry-reconcile ride-along (design-memory-placement.md A3,
   relocated here from `figma-audit` in Slice 4; enumeration moved to
   `pull-registry` in `registry-covers-kit.md`).** Run
   `argo design pull-registry` as its own deterministic step first —
   runnable standalone (after designers touch the file directly, not only
   after a full sync) or as part of this procedure. It enumerates every
   page over the REST API, classifies each live component's `kind` via
   `isKitPageName` (by-exclusion: every page that isn't one of this
   project's own canonical pages or a divider/sandbox page), and upserts
   lean `kind: 'kit'` draft entries for any component the registry has
   never seen — no live MCP session required for this part. It also scans
   every live component's description for the `@code-owned: <path>` marker
   and derives `kind: 'code-owned'` + `codePath` for those (the marker
   overrides positional kit/custom classification) — the machine-written way
   a Three.js/canvas placeholder gets flagged; the registry is never
   hand-edited for this.

   Division of labor: `pull-registry` owns **enumeration and kit-entry
   upsert**, deterministically, no live session. The live node-id walk
   above (already gathering `get_metadata` for the staleness sweep) stays
   scoped to what genuinely needs a live session — diff that same live list
   against the now-complete `design/registry.json` via
   `reconcileRegistrySweep` (import from `@argohq/kit/design-kit`), wired as
   ONE combined `use_figma` read with the staleness walk above, not two
   separate round-trips (this skill's own efficiency rule). It reports
   `registry-orphan` (entry whose nodeId no longer resolves AND whose name
   isn't found live) and `registry-unregistered` (live component absent
   from the registry — an agent that crashed before its final upsert, or a
   `pull-registry` run that hasn't happened yet); the category-dependent
   `registry-miscategorized` rule is gone along with the `category` field.
   `lucide/*`/`demo/*` stay excluded from both `pull-registry`'s upsert and
   this MCP-side sweep (same `PASCAL_EXEMPT_PREFIXES` check, enforced in
   both places). **Scratch-prefix page exclusion:** any top-level component
   whose owning page name starts with `Scratch` (case-sensitive prefix
   match, same style as `isWireframePageName`'s `W\d{2}` convention in
   `tier0-rules.ts`) is excluded from the `registry-unregistered` sweep
   entirely — sandbox work never generates registry-hygiene noise (design
   doc decision 4). Both findings are advisory, never blocking. Because the
   walk already holds the full node list, also re-resolve + persist any
   entry whose `nodeId` moved (a `combineAsVariants`/variant restructure
   minted a new id — far more common than deletion, and not something
   `pull-registry`'s name+id snapshot can resolve on its own) via
   `getNodeByIdAsync`/`findAll`, and stamp `syncedAtWriteCount`/
   `figmaFileVersion` on the registry header — this is a live-Figma-only
   concern the pure `reconcileRegistrySweep` function can't perform itself;
   the walker marshals `nodeIdResolves`/`pageName` per entry before calling
   it.
3. **Dump specs.** Per-variant×**state**×mode node metrics — including
   `layoutSizing` (D14/D20) — into `design/specs/<Component>.json`, for
   every synced component, base or custom, uniformly. Validate each entry
   against `StoryMapEntrySchema`'s sibling shape where applicable.
4. **Capture reference screenshots.** Per variant×mode, into
   `design/screenshots/<Component>/<variant>.<mode>.png` — so tier 2 and
   headless rebuilds never need live MCP access (C6). For every non-default
   Semantic mode: **do not** duplicate the frame — temporarily flip
   `explicitVariableModes` on the default-mode frame to that mode, capture,
   then **revert** — the flip is capture-only and never persists (the owner
   mandate forbids persistent explicit variable modes; mode-copy siblings are
   retired). A single-mode Semantic collection has no non-default mode to
   capture, so this degenerates to a single capture.
5. **Export assets.** Icons/images via MCP asset tools (SVG optimized,
   `currentColor` where tokenized), committed alongside.
6. **Build `story-map.json`.** Component key + node id → story id → import
   path → prop mapping (D1), validated against `figma-design-kit`'s
   `StoryMapEntrySchema`.
7. **Follow the installed recipe's code-target token-writer doc**
   (the `recipe` field in the app's `design.<app>` block in `.claude/argo.json`
   selects which recipe's `code-target/token-writer.md` applies —
   today that's `token-writer.md` for `shadcn-tailwind`, template dir
   `templates/design/recipes/shadcn-tailwind/`) to
   regenerate the generated token region in the project's `tokenFilePath`
   from the freshly dumped `tokens.json` — that doc names the ONE writer for
   that region (D19); never hand-edit it. A future non-Tailwind code-target
   ships its own sibling doc; this step never needs to change to support it.
8. **Refresh fixtures** the spec-diff/VRT walkers read (`design/specs/*`,
   `design/screenshots/*`) so the next gated-build slice sees fresh data.
9. **Commit** every artifact above as one commit (or a small, clearly-scoped
   set) — this is what makes downstream gates deterministic (§4's artifact
   discipline: gates only ever compare committed artifacts).

## Fail loud, never silently skip

If the tier-0 audit reports any `hard` violation on a synced component, stop
— do not write partial artifacts for that component. Report which
components synced cleanly and which were blocked, with the audit's
violation detail.

## Verification

Manual dry-run only during authoring — no Figma file or host project lives
in this repo to exercise this against. Real verification happens on a host
project's first live sync.
