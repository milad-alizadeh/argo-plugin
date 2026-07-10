#!/usr/bin/env bash
# Run every argo eval suite SERIALLY and print a pass/fail summary.
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

# Refuse to run while other argo agents are spawning models (rate-limit guard).
if pgrep -f 'claude .*(--print|-p )' >/dev/null 2>&1; then
  echo "WARNING: a 'claude --print' process is already running (another agent?)."
  echo "Running evals now risks a rate-limit kill of both. Ctrl-C to abort; continuing in 5s..."
  sleep 5
fi

TARGET="${1:-all}"
rc=0

run_suite() {
  local name="$1"; shift
  echo ""
  echo "=============================================="
  echo "  $name"
  echo "=============================================="
  # evalite enforces maxConcurrency:1 via evalite.config.ts; one file at a time.
  bunx evalite run "$@"
  local code=$?
  [ $code -ne 0 ] && rc=$code
  return $code
}

case "$TARGET" in
  prompts) run_suite "Prompt-surface evals (evals/)" evals/*.eval.ts ;;
  routing) run_suite "SessionStart routing eval (eval/)" eval/card-routing.eval.ts ;;
  all)
    run_suite "SessionStart routing eval (eval/)" eval/card-routing.eval.ts
    run_suite "Prompt-surface evals (evals/)" evals/*.eval.ts
    ;;
  *) echo "usage: bash evals/run-all.sh [all|prompts|routing]"; exit 2 ;;
esac

echo ""
if [ $rc -eq 0 ]; then
  echo "ALL EVAL SUITES PASSED"
else
  echo "SOME EVALS FAILED (exit $rc) — scroll up for the per-scenario scores."
  echo "Note: a failing eval may mean a real prompt regression OR a scorer that"
  echo "doesn't yet discriminate (this is the suite's first live run) — read the"
  echo "actual model output in the evalite report before trusting the verdict."
fi
exit $rc
