---
name: build-design
description: Build out an EXISTING screen (or wave of screens) in Figma autonomously — ONE long-lived designer session works a BUILD-ORDER wave component-first, with a frozen region-contract as the completeness oracle, deterministic coverage gates on every commit, and an independent adversarial design-verifier before it lands. The design analog of /argo:build-plan. Use when a screen's PRD + brief + wireframe exist and you want the hi-fi built hands-off; for a single component jump straight to /argo:figma-create.
---

# Build a Screen (single-session, contract-gated, anti-recreation-preserving)

The **automated** design stage of the canonical loop: take a screen whose intent
already exists (PRD → brief → optional wireframe) and build its hi-fi in Figma,
component-first, with completeness **verified against an independent source** and
anti-recreation preserved. It fixes both observed failure modes: overnight
tracing (screens that reskinned wireframe boxes) and silent under-build (a screen
that dropped regions no gate caught).

Why one long-lived session (like `build-plan`): a wave's components are built in
dependency order, then composed — a fresh context per component re-reads the
inventory every time. Determinism lives in the **gates** (deterministic hooks +
an isolated verifier), never in the builder's self-assessment — a builder
grading its own screen is exactly what let D01 under-build.

## The core insight (why the obvious gate would be theater)

Diffing a built screen against its own **brief** is circular: `figma-wireframe`
makes the wireframe a near-echo of the brief, so brief → wireframe → hi-fi narrow
together. The completeness gate needs sources the built screen did NOT descend
from:
- the **PRD's requirements** (`Visible in build?` rows) as the *semantic*
  contract — what the screen must DO, authored upstream, independent of layout;
- the frozen **region-contract** (extracted from the wireframe once, version-
  stamped) as the *structural* contract — what regions must exist, as real
  instances.

## 1. Preconditions — check all, fail loudly
- **A PRD** for the feature (`.claude/prds/<feature>.md`) with a feature→screen
  matrix, and **a brief** for the screen (`design/briefs/<screen>.md`) with a
  machine-readable region-disposition block. No PRD or no brief → stop; author
  them first (`/argo:write-prd`, then the brief).
- **A wireframe** with a resolvable Figma node id (optional per the loop, but if
  present it is frozen into the region-contract — the structural check needs it).
  Component-only builds skip the wireframe and run PRD-semantic checks only.
- **INVENTORY / RECONCILIATION / BUILD-ORDER** mounted **READ-ONLY** — the
  anti-recreation authority. The net-new budget is a ceiling only a human raises.
- **design-guard armed** (`design/config.json` present, so the coverage +
  commit gates fire) and a **design-verifier** available.
- **Figma MCP reachable** (load tools via ToolSearch if deferred): `get_metadata`,
  `get_screenshot`, plus the create tools the designer uses.

## 2. Freeze the contract (P1)
Run the extract step: `get_metadata` on the wireframe node, flatten named regions
to `design/contracts/<screen>.json` (`{ screen, wireframeNodeId,
figmaFileVersion, regions }`). Version-stamped and committed — this is the frozen
structural oracle. Never re-extract mid-build to "match" what you built (that
re-introduces the circularity); if the wireframe legitimately changes, that's a
new frozen version and a human seam.

## 3. Reconcile HARD, before any Figma write (P2)
The brief's region-disposition block must account for **100%** of contract
regions: each region is either `built-here` (+ component + REUSE/EXTEND/
RECONCILE/NEW verdict) or `deferred-to-<wave/screen>` (+ reason, target validated
against BUILD-ORDER). Extend the rows with an optional **REQ-ID column** so a PRD
requirement mapped to no region is flagged here. Run `region-coverage.mjs`: any
contract region with no disposition row = FAIL before a single Figma write. **This
is the cheapest catch — it stops an under-build here, pre-Figma.**

## 4. Build component-first (P3), then compose (P4)
Walk BUILD-ORDER: `figma-create` each composite in dependency order — audit-gated,
registered, anti-recreation UNCHANGED (inventory citation, kit-name-collision
hard gate, RECONCILE-codegen denylist). An unmatched composite ESCALATES to a
human — NEVER auto-`NEW` past the budget. Only when the components exist do you
compose the screen from **instances** (not fresh frames). The compose-time
coverage diff is advisory (non-authoritative) — a nudge, not the gate.

## 5. Verify independently (P5) — HARD, this is the gate of record
Coverage is produced by a **non-compose** producer and checked by an isolated
verifier, so the builder cannot grade its own work:
- **(a)** tier-0 audit receipt clean.
- **(b)** Structural coverage: an independent run does `get_metadata` on the
  BUILT screen; `region-contract.js` classifies present | deferred | UNACCOUNTED
  | MISSING. `present` REQUIRES a registry-backed **instance** (a bare frame is
  hollow-MISSING) — so coverage can't be satisfied by tracing boxes. `record-
  coverage-receipt.mjs` writes `design/coverage-receipt.json` (`producedBy ≠
  compose`); `design-coverage-gate.mjs` blocks the commit unless the receipt is
  fresh, `clean` (UNACCOUNTED 0 && MISSING 0), and non-compose-produced.
- **(c)** Spawn the **design-verifier** agent (separate, sonnet, HARD-isolated):
  it gets ONLY wireframe + built screenshots + region-contract + the PRD's
  `Visible in build?` REQ rows + the deferral ledger — never this transcript. It
  rules each requirement present/absent (semantic) and re-walks regions
  (structural), checks deferral honesty + cardinality. Any absent requirement or
  UNACCOUNTED region → **BLOCK**.

**Scorecard** (the number that would have changed D01): regions covered /
deferred / **UNACCOUNTED (must be 0)** / MISSING, requirements present / **absent
(must be 0)**, dishonest deferrals, anti-recreation collisions. UNACCOUNTED>0 or
absent>0 = FAILED regardless of tier-0.

## 6. Land (P6)
figma-sync → committed artifacts; the integrator commits the design worktree. The
one human seam: sanity-check the deferral ledger (a session that hits UNACCOUNTED
must STOP and surface — it may not self-defer to dodge the gate; deferrals are a
frozen PLANNING output, read-only at verify time).

## Session shape & recovery
One long-lived session per screen, sequential across a wave; fan-out only along
BUILD-ORDER's shared-composite graph with a claim/lock so two sessions can't both
build the same NEW composite. Durable on-disk state (contracts, dispositions,
receipts, registry, progress doc) + the Figma file survive an interruption;
rate-limit recovery inherits `orchestrate` §4.
