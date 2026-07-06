#!/usr/bin/env node
/**
 * Test-smell warner (PostToolUse on Edit|Write). WARNS, never blocks — hooks enforce
 * order and receipts deterministically; test QUALITY is a judgement call, so the most
 * a hook should do is put the smell in front of the model while the file is still
 * fresh. Exit 2 on a PostToolUse hook feeds stderr back to the agent without undoing
 * the write; exit 0 stays silent.
 *
 * Smells flagged (in test files only):
 *  - e2e specs asserting on an internal bridge (`window.api.*` / `window.electron*`)
 *    instead of the rendered DOM — a unit test wearing an e2e costume.
 *  - vacuous assertions: expect(true), expect(1).toBe(1) shapes.
 *  - vi.mock / jest.mock of the module the test file is named after — mocking the
 *    unit under test proves nothing.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
function read(stream) {
    return new Promise((resolvePromise) => {
        let d = '';
        stream.setEncoding('utf8');
        stream.on('data', (c) => (d += c));
        stream.on('end', () => resolvePromise(d));
    });
}
const raw = await read(process.stdin).catch(() => '');
let filePath;
try {
    filePath = JSON.parse(raw)?.tool_input?.file_path;
}
catch {
    process.exit(0);
}
const TEST_FILE = /\.(test|spec|ct\.spec|e2e)\.[cm]?[jt]sx?$/;
if (!filePath || !TEST_FILE.test(filePath))
    process.exit(0);
let src;
try {
    src = readFileSync(filePath, 'utf8');
}
catch {
    process.exit(0);
}
const warnings = [];
if (/expect\s*\(\s*(await\s+)?window\.(api|electron)\b/.test(src)) {
    warnings.push('asserts on the internal bridge (window.api/window.electron) — assert the rendered DOM the user sees instead; an internal-API check is a unit test wearing an e2e costume (ok only as an explicit stand-in before the UI exists)');
}
if (/expect\s*\(\s*true\s*\)\s*\.\s*toBe(Truthy)?\s*\(/.test(src) || /expect\s*\(\s*(\d+)\s*\)\s*\.\s*toBe\s*\(\s*\1\s*\)/.test(src)) {
    warnings.push('contains a vacuous assertion (expect(true)/expect(n).toBe(n)) — it can never fail, so it proves nothing');
}
// vi.mock/jest.mock of the module this very file is testing (same base name).
const base = basename(filePath).replace(/\.(test|spec|ct\.spec|e2e)\.[cm]?[jt]sx?$/, '');
const mockRe = /(?:vi|jest)\.mock\s*\(\s*['"]([^'"]+)['"]/g;
for (let m; (m = mockRe.exec(src));) {
    const mocked = basename(m[1]).replace(/\.[cm]?[jt]sx?$/, '');
    if (mocked === base) {
        warnings.push(`mocks the module under test ("${m[1]}") — the test then exercises the mock, not the code`);
    }
}
if (warnings.length === 0)
    process.exit(0);
process.stderr.write(`Test-smell warning (non-blocking) in ${filePath}:\n` +
    warnings.map((w) => `  - ${w}`).join('\n') +
    '\nFix now if the smell is real; if intentional, say why in the test file.\n');
process.exit(2);
//# sourceMappingURL=test-smell.js.map