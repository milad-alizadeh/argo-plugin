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
   affected entry's `lastSyncedAt`/`status` in `design/registry.json`. End
   with a **review-prompt printout** — list every entry that moved to
   `out-of-sync`/`orphaned` — this is advisory, never a gate: auto-regen on
   sync is explicitly out of scope (design doc "Rejected alternatives").

   **Registry-reconcile ride-along (design-memory-placement.md A3,
   relocated here from `figma-audit` in Slice 4).** The live node-id walk
   above already holds every top-level COMPONENT/COMPONENT_SET on Custom
   Components — diff that same live list against `design/registry.json` via
   `reconcileRegistrySweep` (import from `@argohq/kit/design-kit`), wired as
   ONE combined `use_figma` read with the staleness walk above, not two
   separate round-trips (this skill's own efficiency rule). It reports
   `registry-orphan` (entry whose nodeId no longer resolves AND whose name
   isn't found live) and `registry-unregistered` (live component absent
   from the registry — an agent that crashed before its final upsert); the
   category-dependent `registry-miscategorized` rule is gone along with the
   `category` field. **Scratch-prefix page exclusion:** any top-level
   component whose owning page name starts with `Scratch` (case-sensitive
   prefix match, same style as `isWireframePageName`'s `W\d{2}` convention
   in `tier0-rules.ts`) is excluded from the `registry-unregistered` sweep
   entirely — sandbox work never generates registry-hygiene noise (design
   doc decision 4). Both findings are advisory, never blocking. Because the
   walk already holds the full node list, also re-resolve + persist any
   entry whose `nodeId` moved (a `combineAsVariants`/variant restructure
   minted a new id — far more common than deletion) via
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
   then **revert** (D11, generalized to mode copies, 2026-07-05); a
   single-mode Semantic collection has no non-default mode to capture, so
   this degenerates to today's single-capture behavior. Screens never get a
   hand-maintained mode duplicate, only components do.
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
in this repo to exercise this against. Real verification happens at argo-v2
Phase B's first live sync.
