/**
 * Wave-scoped copy deck: the single upstream source for every authored
 * string in a wave, so the same entity is named identically across screens.
 */
import { z } from 'zod'

export const CopyDeckEntrySchema = z
  .object({
    region: z.string().min(1),
    key: z.string().min(1),
    /** The canonical string, verbatim as it must appear on canvas. */
    text: z.string().min(1).optional(),
    /** Reference into `sharedTerms` — any string used in >1 region rides here, never retyped. */
    sharedTerm: z.string().min(1).optional()
  })
  .refine((e) => (e.text != null) !== (e.sharedTerm != null), {
    message: 'exactly one of text or sharedTerm is required'
  })

export const CopyDeckSchema = z.object({
  wave: z.string().min(1),
  sharedTerms: z.record(z.string(), z.string()).default({}),
  entries: z.array(CopyDeckEntrySchema)
})

export type CopyDeck = z.infer<typeof CopyDeckSchema>

/**
 * Flattens a deck into the allowed-string list the design-rules copy predicate
 * matches TEXT nodes against. A `sharedTerm` reference that resolves to
 * nothing throws — a dangling reference is exactly the cross-screen drift
 * the deck exists to kill, so it must never flatten silently.
 */
export function copyDeckStrings(deck: unknown): string[] {
  const parsed = CopyDeckSchema.parse(deck)
  const strings: string[] = Object.values(parsed.sharedTerms)
  for (const entry of parsed.entries) {
    if (entry.text != null) {
      strings.push(entry.text)
    } else {
      const resolved = parsed.sharedTerms[entry.sharedTerm!]
      if (resolved == null) {
        throw new Error(`copy-deck: entry ${entry.region}/${entry.key} references sharedTerm "${entry.sharedTerm}" which is not in sharedTerms`)
      }
      strings.push(resolved)
    }
  }
  return strings
}
