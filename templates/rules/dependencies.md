---
# TEMPLATE — installed (adapted) by the setup-claude skill, not shipped active.
# setup-claude sets the paths glob to this project's real manifest/lockfiles.
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
