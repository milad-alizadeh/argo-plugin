---
paths:
  - "**/package.json"
  - "bun.lock"
---

# Dependency Hygiene

Prefer a well-maintained library over bespoke logic for any **solved problem** —
cryptography, auth, date/time, HTTP, parsing, encoding (base64/JSON), schema
validation. Hand-rolled versions of these are bugs waiting to happen; do not
reinvent them.

- **Never hand-edit `bun.lock` or hand-write a version.** Add, upgrade, or
  remove packages by running `bun add` / `bun remove` from the repo root so the
  lockfile stays authoritative.
- **Vet before adding:** is it maintained (recent releases, open-issue health),
  reasonably sized, and licence-compatible? Prefer the option the ecosystem
  already standardised on over a novel one.
- **Don't add a dependency for a few lines** you can write clearly yourself, and
  don't keep one you no longer use — prune dead dependencies.
- Pin/track versions through `bun.lock`; let the manager resolve the tree.
