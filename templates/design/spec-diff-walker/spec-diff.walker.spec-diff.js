import { describe, it, expect } from 'vitest'
import { composeStories } from '{{STORYBOOK_TEST_PACKAGE}}'
import * as allStories from '{{STORIES_GLOB_OR_INDEX}}'
import { compareColor, comparePxInteger, compareHugDimension } from 'figma-design-kit'
import { convertLineHeight, convertLetterSpacing, resolveBoxModel } from 'figma-design-kit'
import specsByComponent from '{{DESIGN_SPECS_GLOB_OR_INDEX}}'

/**
 * Tier-1 spec-diff walker (figma-to-code-pipeline.md §5 tier 1): for every
 * story × mode, compares getComputedStyle/getBoundingClientRect against the
 * matching design/specs/<Component>.json entry using the D20 comparator +
 * conversion table. This IS the C17 scoped exception — geometry assertions
 * here regenerate from Figma, they are not hand-authored (see
 * templates/design/testing-rule-amendment.md).
 *
 * The per-mode differential check replaces "token binding" claims:
 * getComputedStyle erases var() indirection, so instead this walker asserts
 * that light/dark differ exactly where the spec says they should.
 */
for (const [storyFile, storyModule] of Object.entries(allStories)) {
  const composed = composeStories(storyModule)
  const componentSpec = specsByComponent[storyFile]

  const covered = Object.entries(composed).filter(
    ([storyName]) => componentSpec?.variants?.[storyName]
  )

  describe(`spec-diff: ${storyFile}`, () => {
    // A story with no committed spec is dormant, not broken — an empty
    // describe (zero its) is a Vitest failure, so emit an explicit todo.
    if (covered.length === 0) {
      it.todo(`no committed spec for ${storyFile} yet — figma-sync dumps design/specs entries`)
      return
    }
    for (const [storyName, Story] of covered) {
      const variantSpec = componentSpec?.variants?.[storyName]
      if (!variantSpec) continue

      for (const mode of ['light', 'dark']) {
        it(`${storyName} (${mode}) matches design/specs/${storyFile}.json`, async () => {
          // D20: font determinism is a tier-1 precondition — measurements
          // taken before webfonts settle produce false geometry diffs.
          await document.fonts.ready

          const { container } = await Story.run({ parameters: { theme: mode } })
          const el = container.firstElementChild
          const computed = getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          const spec = variantSpec[mode]

          const color = compareColor(spec.fill, computed.backgroundColor)
          expect(color.pass, `fill: ${JSON.stringify(color)}`).toBe(true)

          const radius = comparePxInteger(spec.cornerRadius, parseFloat(computed.borderRadius))
          expect(radius.pass, `cornerRadius: ${JSON.stringify(radius)}`).toBe(true)

          const lineHeight = convertLineHeight(spec.lineHeight.value, spec.lineHeight.unit)
          expect(computed.lineHeight).toBe(lineHeight)

          const letterSpacing = convertLetterSpacing(spec.letterSpacingPercent, spec.fontSize)
          expect(parseFloat(computed.letterSpacing)).toBeCloseTo(letterSpacing.px, 1)

          const boxModel = resolveBoxModel(spec.layoutSizing.horizontal)
          if (boxModel.checkType === 'hug') {
            const width = compareHugDimension(spec.width, rect.width, boxModel.tolerance)
            expect(width.pass, `width (HUG): ${JSON.stringify(width)}`).toBe(true)
          } else if (boxModel.checkType === 'fixed') {
            const width = compareHugDimension(spec.width, rect.width, 0)
            expect(width.pass, `width (FIXED): ${JSON.stringify(width)}`).toBe(true)
          }
        })
      }
    }
  })
}
