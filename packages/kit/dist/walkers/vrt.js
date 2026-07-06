/**
 * Tier-3 visual-regression walker FACTORY (D6; decision 14, glob-map
 * signature): the host shim (staying at `test/vrt/` in host projects) passes
 * already-imported modules — the stories glob map, its `composeStories`, and
 * the committed-baselines glob map (`import.meta.glob` result, vite-side) —
 * never paths.
 *
 * Ordering is enforced by D22: baselines are only ever committed after a
 * recorded tier-2 gestalt PASS. This walker never writes a first-run
 * baseline unattended in a hands-off build — see /argo:figma-to-code, which
 * owns that ordering.
 */
import { describe, it, expect } from 'vitest';
export function runVrtWalker({ stories, composeStories, committedBaselines }) {
    // D22 ordering: stories with no committed baseline are dormant todos, not
    // failures — and the toMatchScreenshot matcher may not be registered yet.
    const baselineCount = Array.isArray(committedBaselines)
        ? committedBaselines.length
        : Object.keys(committedBaselines ?? {}).length;
    for (const [storyFile, storyModule] of Object.entries(stories)) {
        const composed = composeStories(storyModule);
        describe(`vrt: ${storyFile}`, () => {
            if (baselineCount === 0) {
                it.todo(`stories exist but no committed baseline for ${storyFile} yet`);
                return;
            }
            for (const [storyName, Story] of Object.entries(composed)) {
                for (const mode of ['light', 'dark']) {
                    it(`${storyName} (${mode}) matches its committed baseline`, async () => {
                        const { container } = await Story.run({ parameters: { theme: mode } });
                        // toMatchScreenshot is a Playwright-CT matcher the host project's own
                        // vitest config registers — not part of this package's own type surface.
                        await expect(container).toMatchScreenshot(`${storyFile}/${storyName}.${mode}.png`);
                    });
                }
            }
        });
    }
}
//# sourceMappingURL=vrt.js.map