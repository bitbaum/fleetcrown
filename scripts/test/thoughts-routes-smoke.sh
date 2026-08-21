#!/usr/bin/env bash
# Smoke every Thoughts essay slug — catches "essay exists in git but 404s in prod"
# when content/ was not copied or deploy lagged. Filesystem is SSOT for slugs.
#
# Usage:
#   npm run test:thoughts-routes
#   BASE=https://fleetcrown.orangecat.ch npm run test:thoughts-routes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
THOUGHTS_DIR="$PROJECT_DIR/content/thoughts"
BASE="${BASE:-http://localhost:3000}"
ERROR_BOUNDARY_MARKER="Something went wrong"

if [ ! -d "$THOUGHTS_DIR" ]; then
  echo "✗ missing $THOUGHTS_DIR" >&2
  exit 1
fi

if ! curl -s -o /dev/null --max-time 20 "$BASE/"; then
  echo "✗ no server at $BASE" >&2
  exit 2
fi

mapfile -t SLUGS < <(find "$THOUGHTS_DIR" -maxdepth 1 -name '*.md' -printf '%f\n' | sed 's/\.md$//' | sort)

if [ "${#SLUGS[@]}" -eq 0 ]; then
  echo "✗ no essay slugs found" >&2
  exit 1
fi

failed=0
for slug in "${SLUGS[@]}"; do
  body_file=$(mktemp)
  code=$(curl -s -o "$body_file" --max-time 30 -w "%{http_code}" "$BASE/thoughts/$slug" || echo "000")
  if [ "$code" != "200" ]; then
    printf "  FAIL %3s  /thoughts/%s\n" "$code" "$slug"
    failed=$((failed + 1))
    rm -f "$body_file"
    continue
  fi
  if grep -q "$ERROR_BOUNDARY_MARKER" "$body_file"; then
    printf "  FAIL %3s  /thoughts/%s (error boundary)\n" "$code" "$slug"
    failed=$((failed + 1))
    rm -f "$body_file"
    continue
  fi
  rm -f "$body_file"
done

total=${#SLUGS[@]}
ok=$((total - failed))
echo ""
if [ "$failed" -gt 0 ]; then
  echo "✗ $failed/$total thought route(s) failed at $BASE"
  exit 1
fi
echo "✓ all $total thought routes ok at $BASE"
