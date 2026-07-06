#!/usr/bin/env node
/**
 * Design coverage gate (PreToolUse on Bash, `git commit` only). The P5 half
 * of build-design-workflow.md's completeness gate: a commit touching a
 * screen's built component code may only land with a fresh, clean,
 * non-compose, screen-matched `design/coverage-receipt-<screen>.json` —
 * never an LLM's narration that "the region diff came back clean", and
 * never a stale receipt from a DIFFERENT screen (C2 fix — the ruling's top
 * silent-failure risk was a clean receipt from screen N passing the gate
 * for screen N+1). Mirrors design-commit-gate.js's receipt-gate shape
 * exactly; this is the coverage half, not the spec-diff half.
 *
 * SELF-SCOPING: arms per-app from `.claude/argo.json`'s `design.<app>`
 * blocks — same decision-8 dual-mode contract as design-commit-gate.js,
 * independent of `.argo/build-mode.json`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeBlock } from './lib/gate-block.js';
/**
 * The gate's decision logic — moved to the kit module (region-contract.js)
 * so it lives alongside `screenMatchesReceipt` (C2's screen cross-check) and
 * `deriveExpectedScreensFromStagedFiles`, and is unit-tested there, off-
 * Figma; re-exported here unchanged so this file's own export surface
 * doesn't move.
 */
export { evaluateCoverageReceipt, coverageReceiptFilename, deriveExpectedScreensFromStagedFiles } from '../design-kit/region-contract.js';
function readStdin() {
    return new Promise((resolvePromise) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => (data += c));
        process.stdin.on('end', () => resolvePromise(data));
    });
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const { evaluateCoverageReceipt, coverageReceiptFilename, deriveExpectedScreensFromStagedFiles } = await import('../design-kit/region-contract.js');
    const { findArgoJson, armedDesignApps } = await import('../config/argo-json.js');
    const raw = await readStdin().catch(() => '');
    let hook;
    try {
        hook = JSON.parse(raw);
    }
    catch {
        process.exit(0);
    }
    const command = hook?.tool_input?.command;
    if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command))
        process.exit(0);
    const cwd = hook?.cwd;
    if (typeof cwd !== 'string' || cwd.length === 0)
        process.exit(0);
    const found = findArgoJson(cwd);
    if (!found)
        process.exit(0); // no .claude/argo.json up the tree — inert
    let stagedFiles;
    try {
        stagedFiles = execFileSync('git', ['-C', found.repoRoot, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
            .split('\n')
            .filter(Boolean);
    }
    catch {
        process.exit(0); // not a git repo — nothing staged to gate
    }
    const armed = armedDesignApps(found, stagedFiles);
    if (armed.length === 0)
        process.exit(0);
    const block = makeBlock('Design coverage gate');
    for (const app of armed) {
        // Screen derivation reads app-relative `design/**` paths, so a monorepo
        // app's staged files are re-rooted to the app before the C2 cross-check.
        const [expectedScreen] = deriveExpectedScreensFromStagedFiles(app.appRelativeStagedFiles);
        const receiptPath = join(app.designDir, coverageReceiptFilename(expectedScreen ?? ''));
        if (!expectedScreen || !existsSync(receiptPath))
            block('commit touches built component code with no matching per-screen coverage receipt — run argo design record-coverage-receipt first');
        const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
        const contractPath = join(app.designDir, 'contracts', `${receipt.screen}.json`);
        const contractFigmaFileVersion = existsSync(contractPath)
            ? JSON.parse(readFileSync(contractPath, 'utf8'))?.figmaFileVersion
            : undefined;
        const decision = evaluateCoverageReceipt(receipt, { expectedScreen, contractFigmaFileVersion });
        if (!decision.ok)
            block(decision.reason);
    }
    process.exit(0);
}
//# sourceMappingURL=design-coverage-gate.js.map