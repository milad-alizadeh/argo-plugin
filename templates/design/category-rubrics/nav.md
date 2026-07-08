---
category: nav
visualCriteria:
  - id: active-item-affordance
    prompt: "Does the active/current nav item read as visually distinct from its siblings?"
    requiresZoomedCrop: false
  - id: icon-identity
    prompt: "Does each nav item's icon match its semantic meaning (not just present, the correct glyph)?"
    requiresZoomedCrop: true
---

# nav — category visual criteria

Human-authored once for this category (fidelity-geometry-verifier.md Slice
10). `assembleFidelityRubric` merges these fixed criteria with any brief-
named requirements; never edit this file to encode a single screen's
requirements — those belong in the screen brief, not here.
