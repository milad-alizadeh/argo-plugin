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
import { writeFileSync, mkdirSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Atomic write (design-memory-placement.md A4/step 3): write to a temp file
 * in the same directory, then `renameSync` over the final path — POSIX
 * rename is atomic, so a crash mid-write leaves the prior file intact
 * (never a truncated/partial registry.json, audit-receipt.json, or
 * spec-diff-receipt.json — every caller shares this one writer).
 */
export function writeDesignJson(cwd, filename, data) {
    const dir = join(cwd, 'design');
    mkdirSync(dir, { recursive: true });
    const destination = join(dir, filename);
    const tempPath = join(dir, `.${filename}.tmp-${process.pid}-${Date.now()}`);
    writeFileSync(tempPath, JSON.stringify(data, null, 2));
    renameSync(tempPath, destination);
}
/**
 * Schema-validate-or-rebuild read contract (design-memory-placement.md A4/
 * step 3, mirroring design-guard-record.js's corrupt-state recovery): on a
 * missing file, a JSON parse failure, or (when `schema` is passed) a schema
 * validation failure, log an advisory to stderr and return `rebuild()`'s
 * result rather than throwing or crashing — this is a read-time recovery
 * path, not a hard gate.
 */
export function readDesignJsonOrRebuild(cwd, filename, { schema, rebuild }) {
    const path = join(cwd, 'design', filename);
    if (!existsSync(path)) {
        process.stderr.write(`readDesignJsonOrRebuild: ${filename} is absent — rebuilding.\n`);
        return rebuild();
    }
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        process.stderr.write(`readDesignJsonOrRebuild: ${filename} is malformed JSON — rebuilding.\n`);
        return rebuild();
    }
    if (schema) {
        const result = schema.safeParse(parsed);
        if (!result.success) {
            process.stderr.write(`readDesignJsonOrRebuild: ${filename} failed schema validation — rebuilding.\n`);
            return rebuild();
        }
        return result.data;
    }
    return parsed;
}
//# sourceMappingURL=write-design-json.js.map