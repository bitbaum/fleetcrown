#!/usr/bin/env bash
# Smoke test: hit every page route and fail if any returns non-2xx/3xx.
# Usage: npm run smoke   (defaults to http://localhost:3000)
#        BASE=https://cockpit.example.com npm run smoke
#
# Routes are derived manually here rather than by parsing navigation.ts,
# because this script must run without a TS toolchain. Keep in sync with
# config/navigation.ts NAV_ITEMS plus the / redirect.

set -u

BASE="${BASE:-http://localhost:3000}"

# Page routes — match config/navigation.ts NAV_ITEMS plus the / redirect.
PAGE_ROUTES=(
  "/"
  "/today"
  "/people"
  "/goals"
  "/projects"
  "/money"
  "/habits"
  "/events"
  "/prompts"
  "/system"
  "/memory"
)

# DB-backed API GETs. Exercises drizzle, the postgres connection, and the
# query layer — catches silent regressions a page-only smoke would miss.
# Tool-dependent endpoints (/api/calendar, /api/weather, /api/github) are
# omitted because they depend on the local Ivy gateway being up.
API_ROUTES=(
  "/api/goals"
  "/api/habits"
  "/api/people"
  "/api/events"
  "/api/crons"
  "/api/system"
)

ROUTES=("${PAGE_ROUTES[@]}" "${API_ROUTES[@]}")

# 1) Probe the base URL once so we fail fast with a clear message
# instead of dribbling out one curl error per route.
if ! curl -s -o /dev/null --max-time 5 "$BASE/"; then
  echo "✗ no server reachable at $BASE — start the dev server first (npm run dev)" >&2
  exit 2
fi

failed=0
for route in "${ROUTES[@]}"; do
  code=$(curl -s -o /dev/null --max-time 30 -w "%{http_code}" "$BASE$route" || echo "000")
  if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
    printf "  ok   %3s  %s\n" "$code" "$route"
  else
    printf "  FAIL %3s  %s\n" "$code" "$route"
    failed=$((failed + 1))
  fi
done

# Dynamic [id] routes — discover an id from a list endpoint, then hit
# the detail route. Catches regressions in the parameter handlers and
# the per-row drizzle queries that the static-list smoke can't.
# Optional: skipped silently if jq isn't installed or the list is empty.
dynamic_total=0
if command -v jq >/dev/null 2>&1; then
  person_id=$(curl -s --max-time 5 "$BASE/api/people" 2>/dev/null \
    | jq -r '.people[0].id // empty' 2>/dev/null)
  if [ -n "$person_id" ]; then
    dynamic_total=$((dynamic_total + 1))
    code=$(curl -s -o /dev/null --max-time 30 -w "%{http_code}" "$BASE/api/people/$person_id" || echo "000")
    route="/api/people/<id>"
    if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
      printf "  ok   %3s  %s\n" "$code" "$route"
    else
      printf "  FAIL %3s  %s\n" "$code" "$route"
      failed=$((failed + 1))
    fi
  fi
fi

total=$((${#ROUTES[@]} + dynamic_total))

echo ""
if [ "$failed" -gt 0 ]; then
  echo "✗ $failed/$total route(s) failed"
  exit 1
fi

echo "✓ all $total routes ok"
