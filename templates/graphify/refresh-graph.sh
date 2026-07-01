#!/usr/bin/env bash
# argo — refresh the graphify knowledge graph, then commit it. SINGLE WRITER:
# run this only on the integration branch (main), on-device (the `integrator`
# agent or a local main-side step). Worktree/agent branches must NOT run it.
#
# Installed (adapted) by the setup-claude skill. Works for BOTH a single-app repo
# and a monorepo: it discovers every workspace that has a graphify-out/ and refreshes
# each; for a single-app repo that's just the root. (setup-claude does the first
# per-workspace build to seed graphify-out/ dirs; this script keeps them current.)
#
# Labeling uses the claude-cli backend — spawns the on-device `claude` (subscription
# auth, NO API key). Without a backend, label degrades to "Community N" placeholders.
set -euo pipefail

command -v graphify >/dev/null 2>&1 || { echo "graphify not installed — skipping graph refresh"; exit 0; }
cd "$(git rev-parse --show-toplevel)"

# Discover workspaces = dirs containing a graphify-out/ (skip node_modules/.git).
# Fall back to the repo root for a single-app project not yet seeded.
# (portable: no `mapfile` — macOS ships bash 3.2)
WORKSPACES=()
while IFS= read -r ws_dir; do
  [ -n "$ws_dir" ] && WORKSPACES+=("$ws_dir")
done < <(
  find . \( -name node_modules -o -name .git \) -prune -o -type d -name graphify-out -print 2>/dev/null \
    | sed 's:/graphify-out$::' | sort -u
)
[ "${#WORKSPACES[@]}" -eq 0 ] && WORKSPACES=(".")

for ws in "${WORKSPACES[@]}"; do
  echo "==> graphify refresh: $ws"
  # cd into the workspace so graphify's CWD-relative writes (manifest etc.) stay
  # inside <ws>/graphify-out/ and don't litter a stray graphify-out/ at the repo root.
  (
    cd "$ws"
    PYTHONHASHSEED=0 graphify update . --force
    graphify label . --missing-only --backend=claude-cli || echo "  (labeling degraded to placeholders)"
  )
done

# Stage only the durable artifacts (graph.json carries the embedded labels Claude
# reads; the report + label cache). Bulk/cache files are gitignored.
git add ':(glob)**/graphify-out/graph.json' \
        ':(glob)**/graphify-out/GRAPH_REPORT.md' \
        ':(glob)**/graphify-out/.graphify_labels.json' 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore(graphify): refresh knowledge graph"
