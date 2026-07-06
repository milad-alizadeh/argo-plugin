/**
 * Shared BLOCK helper for the design-guard hook family (design-guard-stop.js,
 * design-commit-gate.js) — writes a labeled reason to stderr and exits 2,
 * same UX contract as red-proof-gate/trust-gate's own `block()`.
 */
export declare function makeBlock(label: string): (reason: string) => never;
//# sourceMappingURL=gate-block.d.ts.map