/**
 * Shared writer for design-guard's deterministic receipts (extracted from
 * record-audit-receipt.js, which already exercises this exact write shape
 * under test): writes a JSON file under the host project's `design/`
 * directory, creating it if needed. Both `recordAuditReceipt` and
 * `recordSpecDiffReceipt` persist their receipts through this one function
 * so there is a single place that owns the `design/<file>` write contract.
 * Internal library — no CLI entry of its own (design-doc decision, resolved
 * open question 2).
 */
/**
 * Atomic write (design-memory-placement.md A4/step 3): write to a temp file
 * in the same directory, then `renameSync` over the final path — POSIX
 * rename is atomic, so a crash mid-write leaves the prior file intact
 * (never a truncated/partial registry.json, audit-receipt.json, or
 * spec-diff-receipt.json — every caller shares this one writer).
 */
export declare function writeDesignJson(cwd: string, filename: string, data: unknown): void;
/**
 * Schema-validate-or-rebuild read contract (design-memory-placement.md A4/
 * step 3, mirroring design-guard-record.js's corrupt-state recovery): on a
 * missing file, a JSON parse failure, or (when `schema` is passed) a schema
 * validation failure, log an advisory to stderr and return `rebuild()`'s
 * result rather than throwing or crashing — this is a read-time recovery
 * path, not a hard gate.
 */
export declare function readDesignJsonOrRebuild<T>(cwd: string, filename: string, { schema, rebuild }: {
    schema?: {
        safeParse: (v: unknown) => {
            success: boolean;
            data?: T;
        };
    };
    rebuild: () => T;
}): T;
//# sourceMappingURL=write-design-json.d.ts.map