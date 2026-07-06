---
# TEMPLATE — installed (adapted) by the init skill, not shipped active.
# init sets the paths glob to this project's real manifest AND lockfile
# paths — include the lockfile glob (bun.lock / package-lock.json / uv.lock /
# Cargo.lock / …) so the rule attaches when one is edited, which is exactly the
# hand-edit this rule forbids.
paths:
  - "**/package.json"
  - "**/pyproject.toml"
  - "**/go.mod"
  - "**/Cargo.toml"
---

# Dependency Hygiene

Prefer a well-maintained library over bespoke logic for any **solved problem** —
cryptography, auth, date/time, HTTP, parsing, encoding (base64/JSON), schema
validation, UI primitives. Hand-rolled versions of these are bugs waiting to
happen; do not reinvent them.

- **Never hand-edit `{{LOCKFILE}}` or hand-write a version.** Add, upgrade, or
  remove packages by running the project's package manager so the lockfile stays
  authoritative.
- **Vet before adding:** is it maintained (recent releases, open-issue health),
  reasonably sized, and licence-compatible? Prefer the option the ecosystem
  already standardised on over a novel one.
- **Don't add a dependency for a few lines** you can write clearly yourself, and
  don't keep one you no longer use — prune dead dependencies.
- Pin/track versions through `{{LOCKFILE}}`; let the manager resolve the tree.
