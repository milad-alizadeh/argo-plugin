/**
 * build-design-workflow.md's completeness gate (D01 fix): a screen's
 * wireframe is flattened, once, into a frozen contract
 * (`{screen, wireframeNodeId, figmaFileVersion, regions:[{name, path, depth,
 * children}]}`) — the independent oracle every later stage diffs against.
 * PURE, no fs/Figma/network calls, so it is unit-testable off-Figma and safe
 * to run headless in `design-coverage-gate.mjs`.
 *
 * "present" REQUIRES the matching built region to be a registry-backed
 * INSTANCE (`isInstance` truthy) — a bare frame with the right name is a
 * hollow trace, not coverage, so completeness can't be satisfied by tracing
 * boxes (the anti-recreation coupling the spec calls out).
 */
type MetaNode = {
    name: string;
    type?: string;
    layoutMode?: string;
    componentName?: string;
    children?: MetaNode[];
};
type Region = {
    name: string;
    path: string;
    depth: number;
    children: string[];
    kind?: string;
    cardinality?: number;
};
type BuiltRegion = {
    name: string;
    path: string;
    isInstance?: boolean;
    instanceOf?: string;
};
type Disposition = {
    region: string;
    disposition: string;
    component?: string;
    cardinality?: number;
};
type Contract = {
    screen: string;
    wireframeNodeId: string;
    figmaFileVersion: string;
    regions: Region[];
};
type CoverageResult = {
    name: string;
    path: string;
    status: string;
    warning?: string;
};
export declare function flattenToRegions(tree: MetaNode): Region[];
/**
 * P1 extract step, built-screen side: the same promotion rule applied to a
 * BUILT screen's `get_metadata` dump, emitting the `isInstance`/`instanceOf`
 * fields `classifyCoverage` needs — `instanceOf` is the promoted node's
 * `componentName` when it is a registry-backed instance.
 */
export declare function buildBuiltRegions(tree: MetaNode): BuiltRegion[];
export declare function classifyCoverage(contract: Contract, builtRegions?: BuiltRegion[], dispositions?: Disposition[]): CoverageResult[];
/**
 * Code-side coverage classifier (build-screen, option B). A code screen's
 * rendered DOM is not a Figma tree, so `classifyCoverage`'s path-matching does
 * not apply. Instead match each contract region to its disposition's
 * `component` and check that registry-backed component ACTUALLY rendered
 * (`renderedComponents` come from the real render — base kit components self-ID
 * via `data-argo-component` — not the generator's claims). Output shape is
 * identical to `classifyCoverage`, so it feeds `summarize` / the coverage
 * receipt / the gate unchanged.
 *
 * Semantics: `present` when the disposition's component rendered; instance
 * CONSUMPTION means N distinct regions on the same component need N rendered
 * instances (first-come), a shortfall is MISSING; `deferred` for a
 * `deferred-to-*` row; UNACCOUNTED for a rendered component no built-here
 * disposition names; a `cardinality` shortfall is an advisory WARN, never
 * clean-affecting (mirrors `cardinalityWarning`). A region with no disposition,
 * or a built-here row with no `component`, is fail-closed MISSING.
 *
 * TWO DELIBERATE LIMITATIONS (both delegated, not bugs):
 * 1. PLACEMENT-BLIND. This proves the right components rendered in the right
 *    QUANTITY, never that they sit in the correct regions — option B discarded
 *    `classifyCoverage`'s path/position check (a DOM has no matching path). A
 *    screen rendering the right components in the WRONG regions scores clean
 *    here; placement correctness is delegated to the screen-level GESTALT gate
 *    + reviewer. Do not read a clean coverage receipt as proof of layout.
 * 2. NAME-KEYED. Matching keys on `region.name` via `findDisposition`, so two
 *    contract regions sharing a name (C3a's repeated-composite case) collapse
 *    to one disposition row, distinguishable only by consumption count — the
 *    Figma side's path-level distinction is not recoverable on the code side.
 */
export declare function classifyCoverageByComponent(contract: {
    regions: {
        name: string;
        path: string;
    }[];
}, renderedComponents?: {
    component: string;
    path?: string;
}[], dispositions?: Disposition[]): CoverageResult[];
/**
 * Groups a `classifyCoverage` result by status. `clean` is the D01 gate
 * number of record: UNACCOUNTED must be 0 to land, MISSING equally so —
 * `present`/`deferred` alone don't prove completeness. C3b's hollow-
 * instance/cardinality WARNs are surfaced separately (`warnings`) and never
 * affect `clean` — they flag a real build gap without hard-failing a commit
 * that landed a instance boundary but not yet its full contents.
 */
export declare function summarize(classification: CoverageResult[]): {
    present: string[];
    deferred: string[];
    UNACCOUNTED: string[];
    MISSING: string[];
    warnings: {
        name: string;
        path: string;
        warning: string | undefined;
    }[];
    clean: boolean;
};
/**
 * P1 extract step (build-design-workflow.md, C1 fix): wraps `flattenToRegions`
 * with the frozen contract envelope
 * (`{screen, wireframeNodeId, figmaFileVersion, regions}`). The CLI wrapper
 * (`scripts/extract-region-contract.mjs`) is fs/argv glue only — this is the
 * pure, unit-tested shape function.
 */
export declare function buildRegionContract(tree: MetaNode, { screen, wireframeNodeId, figmaFileVersion }: {
    screen: string;
    wireframeNodeId: string;
    figmaFileVersion: string;
}): Contract;
/**
 * C2 fix (design-pipeline-efficiency-ruling.md): today a stale clean
 * coverage receipt from screen N passes `design-coverage-gate.mjs` for
 * screen N+1 — the ruling's top silent-failure risk. `expectedScreen`
 * `undefined` means "no expectation to check" (passes through), same shape
 * as `evaluateCoverageReceipt`'s `contractFigmaFileVersion` option.
 */
export declare function screenMatchesReceipt(receipt: {
    screen?: string;
} | null | undefined, expectedScreen?: string): boolean;
/**
 * C2 fix (design-pipeline-efficiency-ruling.md): the receipt is screen-
 * scoped, not a fixed `coverage-receipt.json` — a stale clean receipt from
 * screen N must never be readable as if it covered screen N+1.
 */
export declare function coverageReceiptFilename(screen: string): string;
/**
 * C2 fix: derives which screen(s) a commit touches from its staged
 * `design/**` artifacts (a `design/contracts/<screen>.json` or
 * `design/coverage-receipt-<screen>.json` path), so `design-coverage-gate.mjs`
 * knows which per-screen receipt to require and cross-check — never a
 * fixed, unscoped `coverage-receipt.json` a stale N-th screen could satisfy.
 */
export declare function deriveExpectedScreensFromStagedFiles(stagedFiles: string[]): string[];
/**
 * The design-coverage-gate.mjs hook's decision logic (moved here so the
 * hook's own file — cursed by this environment's stale cross-repo tdd-guard
 * evidence — never needs a body edit again; the hook just re-exports this).
 * `expectedScreen` is the C2 fix: derived from the staged git diff, it
 * rejects a stale receipt recorded for a different screen (the ruling's top
 * silent-failure risk — today a clean receipt from screen N passes the gate
 * for screen N+1). `contractFigmaFileVersion` is the frozen contract's own
 * stamp — a receipt whose `figmaFileVersion` disagrees is stale against its
 * own source, even if it was recorded seconds ago.
 */
export declare function evaluateCoverageReceipt(receipt: {
    screen?: string;
    producedBy?: string;
    figmaFileVersion?: string;
    timestamp?: number;
    clean?: boolean;
} | null | undefined, { expectedScreen, contractFigmaFileVersion, now }?: {
    expectedScreen?: string;
    contractFigmaFileVersion?: string;
    now?: number;
}): {
    ok: boolean;
    reason?: string;
};
/**
 * C3c fix (design-pipeline-efficiency-ruling.md): P1 freeze lint — a
 * contract's region set or per-region fields (name/path/depth/kind/
 * cardinality/children) may not drift between two committed versions
 * unless `figmaFileVersion` is bumped alongside them. Without this, a
 * silent region-set edit (e.g. loosening `Stage`/`topbar`/`main` to
 * `kind: 'layout'` in the same commit that grades against it) passes
 * unnoticed — the exact a63c7cc regression the ruling calls out.
 * `previous` may be `undefined`/`null` (first-ever freeze — nothing to
 * compare against).
 */
export declare function lintContractFreeze(previous: Contract | null | undefined, next: Contract): {
    ok: boolean;
    reason?: string;
};
/**
 * P2 reconciliation lint (pre-Figma, HARD): every contract region must carry
 * a disposition row — `built-here` (+ component + REUSE/EXTEND/RECONCILE/NEW
 * verdict) or `deferred-to-<target>` (+ reason) — before a single Figma
 * write happens. A region with no row at all is the cheapest possible catch.
 */
export declare function reconcileBrief(contract: {
    regions: {
        name: string;
    }[];
}, dispositions?: Disposition[]): {
    ok: boolean;
    unaccounted: string[];
};
export {};
//# sourceMappingURL=region-contract.d.ts.map