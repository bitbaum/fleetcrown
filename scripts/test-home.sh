#!/usr/bin/env bash
# Run every inline self-test suite under home/. Each suite is a single
# tsx invocation with no external test runner — see home/README.md for
# the per-module breakdown. Exits non-zero on the first failure.
#
# Use:  npm run test:home
#       bash scripts/test-home.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Module → invocation. Modules with --self-test gate their boot path on
# the flag; the others (state/decide/projects/render) run their suite
# when invoked directly with no args.
declare -A SUITES=(
  [state]="home/state.ts"
  [decide]="home/decide.ts"
  [projects]="home/projects.ts"
  [render]="home/render.ts"
  [emit]="home/emit.ts --self-test"
  [log]="home/log.ts --self-test"
  [watcher]="home/watcher.ts --self-test"
  [worker]="home/worker.ts --self-test"
  [calendar-drain]="home/calendar-drain.ts --self-test"
  [layout-generator]="src/lib/zellij-layout-generator.ts --self-test"
  [action-extract]="src/lib/actions/extract-proposal.ts --self-test"
  [checkin-proposal]="src/lib/actions/checkin-proposal.ts --self-test"
  [operator-context]="src/lib/dispatch-operator-context-format.ts --self-test"
)

# Stable order so the output reads top-to-bottom predictably.
SUITES_ORDER=(state decide projects render emit log watcher worker calendar-drain layout-generator action-extract checkin-proposal operator-context)

cd "$REPO_ROOT"

total_pass=0
total_fail=0
for name in "${SUITES_ORDER[@]}"; do
  cmd="${SUITES[$name]}"
  printf '\n→ %s\n' "$name"
  # Capture full output so we can extract the N/M passed footer.
  output=$(npx tsx $cmd 2>&1) || {
    echo "$output"
    echo "✗ $name suite failed"
    exit 1
  }
  echo "$output"
  # Parse "N/M" from the final line — most suites print "N/M passed"
  # but render.ts uses "N/M intents render". Match the count tokens only.
  footer=$(printf '%s' "$output" | tail -1)
  if [[ "$footer" =~ ^([0-9]+)/([0-9]+) ]]; then
    total_pass=$(( total_pass + ${BASH_REMATCH[1]} ))
    total_fail=$(( total_fail + ${BASH_REMATCH[2]} - ${BASH_REMATCH[1]} ))
  fi
done

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf '✓ %d total tests passed across %d home/ self-test suites\n' "$total_pass" "${#SUITES[@]}"
if (( total_fail > 0 )); then
  printf '✗ %d failures\n' "$total_fail"
  exit 1
fi
