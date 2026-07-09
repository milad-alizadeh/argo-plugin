/**
 * `design-matches-code` gate — the code-to-design mirror of
 * `design-rules-check` (workflow-engine-phase1.md Slice 9, step 27 / audit
 * 2.2). Diffs a freshly rendered screenshot against Figma's reference
 * colors using `packages/kit/src/design-kit/comparator.ts`'s OKLCH logic.
 *
 * Per audit 2.2 ("state that comparison gates capture their own render"):
 * this gate captures its own screenshot at check time via an injected
 * `captureScreenshot` function and NEVER reads `input.artifacts.screenshot`
 * (or any other working-agent-supplied artifact) as the thing under test —
 * a working agent's `produces` output is exactly as trustworthy as its own
 * self-report, which comparison gates must not consume. Only the reference
 * (Figma) side is allowed to come from an external source, here threaded
 * through `input.settings`.
 */
import { compareColor } from '@argohq/kit/design-kit';
export function createDesignMatchesCodeGate(options) {
    const { captureScreenshot, epsilon } = options;
    return {
        name: 'design-matches-code',
        async check(input) {
            // The gate's OWN capture — deliberately ignores `input.artifacts`
            // entirely (including any `screenshot` key a working agent's
            // `produces` step may have populated).
            const captured = await captureScreenshot();
            // Figma's reference colors are the one side allowed from an external
            // source (audit 2.2) — threaded through `settings`, never `artifacts`.
            const figmaColors = (input.settings.figmaColors ?? {});
            const findings = [];
            for (const [name, cssColor] of Object.entries(figmaColors)) {
                const rendered = captured.colors[name];
                if (!rendered) {
                    findings.push({ message: `${name}: no rendered color captured for this element`, detail: { name, cssColor } });
                    continue;
                }
                const result = compareColor(rendered, cssColor, epsilon === undefined ? {} : { epsilon });
                if (!result.pass) {
                    findings.push({
                        message: `${name}: color diff Δ${result.maxDelta} exceeds ε${result.epsilon} (expected ${cssColor})`,
                        detail: { name, cssColor, ...result }
                    });
                }
            }
            return {
                passed: findings.length === 0,
                findings,
                evidence: [`captured-screenshot:${captured.uri}`]
            };
        }
    };
}
//# sourceMappingURL=design-matches-code.js.map