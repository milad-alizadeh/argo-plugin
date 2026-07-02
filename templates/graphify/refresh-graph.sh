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

# SINGLE-WRITER guards — this may be invoked automatically (post-merge hook), so it must
# no-op anywhere it isn't the sole authorized writer:
#   1. only on `main` (feature branches / the default integration branch)
#   2. never inside a linked worktree (git-dir under .git/worktrees/) — worktrees read
#      main's graph, never write it, so parallel builds can't race on graph.json
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "graphify refresh: not on main — skipping"; exit 0; }
case "$(git rev-parse --git-dir)" in */worktrees/*) echo "graphify refresh: in a worktree — skipping"; exit 0 ;; esac
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
    # Prune dated backup dirs (graphify-out/YYYY-MM-DD/) older than 14 days —
    # graphify snapshots one per day and never cleans up, so they accumulate.
    find graphify-out -maxdepth 1 -type d \
      -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' -mtime +14 \
      -exec rm -rf {} + 2>/dev/null || true
  )
done

# Stage only the durable artifacts (graph.json carries the embedded labels Claude
# reads; the report + label cache). Bulk/cache files are gitignored.
GRAPH_PATHS=(
  ':(glob)**/graphify-out/graph.json'
  ':(glob)**/graphify-out/graph.html'
  ':(glob)**/graphify-out/GRAPH_REPORT.md'
  ':(glob)**/graphify-out/.graphify_labels.json'
)
git add -- "${GRAPH_PATHS[@]}" 2>/dev/null || true
# Commit scoped to the graphify pathspec — a dirty index elsewhere (e.g. files the
# user staged mid-task when the post-merge hook fires) must never be swept in.
git diff --cached --quiet -- "${GRAPH_PATHS[@]}" \
  || LEFTHOOK=0 git commit -m "chore(graphify): refresh knowledge graph" -- "${GRAPH_PATHS[@]}"
