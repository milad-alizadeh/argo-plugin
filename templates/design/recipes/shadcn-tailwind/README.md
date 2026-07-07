# Recipe: `shadcn-tailwind` (template dir `templates/design/recipes/shadcn-tailwind/`)

- **Design source:** the single-file starter — one maintained Figma starter
  file (shadcn-mirror components, Lucide icons, all variables LOCAL; theme =
  modes on the file's own Semantic collection) DUPLICATED once per project.
  The duplicate becomes the project's design file (`figma.projectFileKey`).
  Vendored shadcn code is the source of truth for base primitives. There is
  no kit library subscription, no `kit.lock`, no Library Swap.
- **`codeTarget`:** `tailwind` — Tailwind CSS custom-property `@theme`
  tokens, ESLint rules scoped to Tailwind's arbitrary-value syntax.

Reference only — not copied into a host project as-is. `/argo:setup-design`
reads this file to confirm the recipe's declared design source/`codeTarget`
before installing the `design-source/`/`code-target/` templates below,
which ARE installed (per `skills/setup-design/templates-reference.md`'s
install-when conditions).
