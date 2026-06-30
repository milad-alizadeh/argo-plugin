#!/bin/bash
# Argo guardrail (PreToolUse/Bash): blocks destructive git commands before Claude
# Code runs them. Wired in this plugin's hooks/hooks.json.
# Opt-out: set ARGO_DISABLE_GIT_GUARD=1 in the environment to disable (e.g. a
# project whose recovery flow legitimately needs `git reset --hard`).
# Adapted from mattpocock/skills (MIT).

[ "${ARGO_DISABLE_GIT_GUARD:-}" = "1" ] && exit 0

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && exit 0   # malformed input or no command — don't block (fail open)

# Each pattern requires the literal `git <subcommand>` so it won't match the same
# words inside a commit message, path, or unrelated substring.
DANGEROUS_PATTERNS=(
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
  'git[[:space:]]+branch[[:space:]]+-D'
  'git[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?\.'
  'git[[:space:]]+restore[[:space:]]+\.'
  'git[[:space:]]+push[[:space:]]+.*(--force|-f([[:space:]]|$))'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qE "$pattern"; then
    echo "Argo guardrail blocked a destructive git command — '$COMMAND' matches '$pattern'. If this is intentional, run it yourself, or set ARGO_DISABLE_GIT_GUARD=1 to disable this guard." >&2
    exit 2
  fi
done

exit 0
