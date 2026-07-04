# Recipe: shadcn-tailwind-external-kit

- **`baseSource`:** `external-library` — components vendor from a published
  shadcn kit library, kept in sync via `kit.lock`/`kit-patches.json` and the
  paired D15 upgrade flow (`/argo:design-upgrade`).
- **`codeTarget`:** `tailwind` — Tailwind CSS custom-property `@theme`
  tokens, ESLint rules scoped to Tailwind's arbitrary-value syntax.

Reference only — not copied into a host project as-is. `/argo:setup-design`
reads this file to confirm the recipe's declared `baseSource`/`codeTarget`
before installing the `design-source/`/`code-target/` templates below,
which ARE installed (per `skills/setup-design/templates-reference.md`'s
install-when conditions).
