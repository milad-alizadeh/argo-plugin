## Design-pack template lane (design pack)

Files under the host project's `design/` directory that are copied or
assembled by `/argo:setup-design`, `/argo:figma-sync`, `/argo:figma-create`,
or `/argo:design-upgrade` from this plugin's own `templates/design/` sources
(e.g. `design/tier0-audit.js`, `design/kit-patches.json`, `design/kit.lock`,
and any recipe `design-source/*` file installed alongside them) are **Figma
Plugin-API scripts and data** — they run only inside Figma via `use_figma`,
never through this project's own test runner, and are not exercised by any
test this project could write. Approve creating, overwriting, or assembling
these files without a preceding failing test in this project.

This exemption is scoped strictly to files under `design/` that originate
from the design pack's own template/recipe sources (identified by the
skill/command doing the copying, not by file extension alone) — a
hand-written application file anywhere else, including hand-written code
that happens to live under `design/`, stays fully subject to normal TDD
enforcement.
