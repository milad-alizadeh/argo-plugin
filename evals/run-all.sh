#!/usr/bin/env bash
# Run every argo eval suite SERIALLY with a live progress indicator.
#
# Evals spawn the real `claude` CLI (on-device subscription auth, no API key).
# They are deliberately NOT part of `vitest run` / CI — model spawns are slow
# and, run in parallel with other agent work, trip the account-wide rate limit
# that kills every running agent. So: run this ALONE, when no builder/council
# agents are in flight.
#
#   bash evals/run-all.sh              # both suites
#   bash evals/run-all.sh prompts      # only the prompt-surface evals (evals/)
#   bash evals/run-all.sh routing      # only the SessionStart routing eval (eval/)
#
# Requires: `claude` on PATH, logged in (no ANTHROPIC_API_KEY needed).

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

which claude >/dev/null 2>&1 || { echo "FAIL: 'claude' CLI not on PATH — evals need the on-device authed CLI."; exit 1; }

if pgrep -f 'claude .*(--print|-p )' >/dev/null 2>&1; then
  echo "WARNING: a 'claude --print' process is already running (another agent?)."
  echo "Running evals now risks a rate-limit kill of both. Ctrl-C to abort; continuing in 5s..."
  sleep 5
fi

# Live elapsed-time heartbeat printed on one rewriting line while a file runs,
# so a slow (30-90s) model spawn is visibly WORKING, not hung. Runs in the
# background; killed the moment the eval file returns.
heartbeat() {
  local label="$1" start=$SECONDS
  while true; do
    printf '\r  \033[2m%s ... %ds elapsed\033[0m   ' "$label" "$((SECONDS - start))"
    sleep 2
  done
}

run_file() {
  local idx="$1" total="$2" file="$3"
  local name; name="$(basename "$file" .eval.ts)"
  printf '\n[%d/%d] %s\n' "$idx" "$total" "$name"
  heartbeat "$name" & local hb=$!
  local start=$SECONDS
  bunx evalite run "$file" >".eval-out.$$.log" 2>&1
  local code=$?
  kill "$hb" 2>/dev/null; wait "$hb" 2>/dev/null
  local dur=$((SECONDS - start))
  if [ $code -eq 0 ]; then
    printf '\r  \033[32mPASS\033[0m %s (%ds)                         \n' "$name" "$dur"
  else
    printf '\r  \033[31mFAIL\033[0m %s (%ds) — output below            \n' "$name" "$dur"
    sed 's/^/    /' ".eval-out.$$.log"
    rc=$code
  fi
  rm -f ".eval-out.$$.log"
}

# Collect the target file list up front so we know N for the [i/N] counter.
TARGET="${1:-all}"
files=()
case "$TARGET" in
  prompts) files=(evals/*.eval.ts) ;;
  routing) files=(eval/card-routing.eval.ts) ;;
  all)     files=(eval/card-routing.eval.ts evals/*.eval.ts) ;;
  *) echo "usage: bash evals/run-all.sh [all|prompts|routing]"; exit 2 ;;
esac

rc=0
total=${#files[@]}
echo "Running $total eval file(s) serially (each spawns claude; expect ~30-90s per file)."
i=0
for f in "${files[@]}"; do
  i=$((i + 1))
  run_file "$i" "$total" "$f"
done

echo ""
echo "=============================================="
if [ $rc -eq 0 ]; then
  echo "  ALL $total EVAL FILE(S) PASSED"
else
  echo "  SOME EVALS FAILED (exit $rc) — see per-file output above."
  echo "  First live run: a red may be a real prompt regression OR a scorer"
  echo "  that doesn't discriminate yet. Read the model output before trusting it."
fi
echo "=============================================="
exit $rc
