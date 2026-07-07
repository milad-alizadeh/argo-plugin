import { describe, it, expect } from 'vitest'
import { composeStories } from '{{STORYBOOK_TEST_PACKAGE}}'
import * as baseSmokeStories from '{{BASE_SMOKE_STORIES_GLOB_OR_INDEX}}'
import { compareColor, comparePxInteger } from 'figma-design-kit'
import { checkWaiver } from 'figma-design-kit'
import baseSpecsByComponent from '{{BASE_SPECS_GLOB_OR_INDEX}}'
import waivers from '../../design/waivers.json'

/**
 * Tier-1b base-congruence gate (D14): diffs our two snapshots against each
 * other — the design file's dumped base-mirror specs vs the rendered vendored
 * shadcn code — using the same D20 comparator as tier 1. Waiver-aware: a
 * waivers.json entry only excuses the EXACT pinned pair (checkWaiver re-fails
 * if observed values move again).
 *
 * D14: state coverage is enumerated, not assumed. Each dumped state is
 * force-applied before measuring — CDP forcePseudoState for
 * hover/focus-visible/active, since those cannot be triggered by prop alone.
 */
const STATES = ['default', 'hover', 'focus-visible', 'active', 'disabled']

// TODO(figma-sync): fill this from the actual dumped variant×state matrix in
// design/specs/<BaseComponent>.json — this scaffold enumerates the STATES
// list above as a starting point, not the source of truth.
async function forceState(page, selector, state) {
  if (state === 'default') return
  if (state === 'disabled') return // prop-driven — set via story args instead
  // TODO(figma-sync): wire the real CDP session here, e.g.:
  //   await page.emulateCDPForcedPseudoState({ selector, state })
  throw new Error(`forcePseudoState for "${state}" not wired yet — see TODO above`)
}

function findWaiver(component, variant, property) {
  return waivers.find((w) => w.component === component && w.variant === variant && w.property === property)
}

for (const [storyFile, storyModule] of Object.entries(baseSmokeStories)) {
  const composed = composeStories(storyModule)
  const baseSpec = baseSpecsByComponent[storyFile]

  const coveredPairs = Object.keys(composed).flatMap((storyName) =>
    STATES.filter((state) => baseSpec?.variants?.[storyName]?.states?.[state]).map((state) => [
      storyName,
      state
    ])
  )

  describe(`base-congruence: ${storyFile}`, () => {
    // A smoke story with no dumped base-mirror spec is dormant, not broken — an
    // empty describe (zero its) is a Vitest failure, so emit an explicit todo.
    if (coveredPairs.length === 0) {
      it.todo(`no dumped base-mirror spec for ${storyFile} yet — figma-sync fills design/specs`)
      return
    }
    for (const [storyName] of Object.entries(composed)) {
      for (const state of STATES) {
        const stateSpec = baseSpec?.variants?.[storyName]?.states?.[state]
        if (!stateSpec) continue // uncovered state — not forceable, listed in the fixture per D14

        it(`${storyName} (${state}) matches the base-mirror spec, or is a sanctioned waiver`, async () => {
          // TODO(figma-sync): render the composed story, call forceState(page, selector, state),
          // then read getComputedStyle/getBoundingClientRect exactly like the tier-1 walker.
          const observedFill = undefined // TODO: getComputedStyle(el).backgroundColor
          const observedRadius = undefined // TODO: parseFloat(getComputedStyle(el).borderRadius)

          const fill = compareColor(stateSpec.fill, observedFill)
          if (!fill.pass) {
            const waiver = findWaiver(storyFile, storyName, 'fill')
            expect(waiver, `unwaived fill drift: ${JSON.stringify(fill)}`).toBeDefined()
            expect(checkWaiver(waiver, stateSpec.fill, observedFill).pass).toBe(true)
          }

          const radius = comparePxInteger(stateSpec.cornerRadius, observedRadius)
          if (!radius.pass) {
            const waiver = findWaiver(storyFile, storyName, 'cornerRadius')
            expect(waiver, `unwaived cornerRadius drift: ${JSON.stringify(radius)}`).toBeDefined()
            expect(checkWaiver(waiver, stateSpec.cornerRadius, observedRadius).pass).toBe(true)
          }
        })
      }
    }
  })
}
