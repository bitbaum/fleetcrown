#!/usr/bin/env bash
# Smoke test: hit every page route and fail if any returns non-2xx/3xx
# OR if the body contains the error-boundary marker (a 200 response that
# renders src/app/error.tsx still indicates a broken server component).
# Usage: npm run smoke   (defaults to http://localhost:3000)
#        BASE=https://cockpit.example.com npm run smoke
#
# Routes are derived manually here rather than by parsing navigation.ts,
# because this script must run without a TS toolchain. Keep in sync with
# config/navigation.ts NAV_ITEMS plus the / redirect.

set -u

BASE="${BASE:-http://localhost:3000}"

# String that src/app/error.tsx renders when a Server Component throws.
# Page responses still carry HTTP 200 in that case, so status-only
# checking misses the regression — body grep is the correction.
ERROR_BOUNDARY_MARKER="Something went wrong"

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
  "/control"
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
  "/api/control"
)

# 1) Probe the base URL once so we fail fast with a clear message
# instead of dribbling out one curl error per route.
# 20s timeout: dev mode compiles on first request which can be slow.
if ! curl -s -o /dev/null --max-time 20 "$BASE/"; then
  echo "✗ no server reachable at $BASE — start the dev server first (npm run dev)" >&2
  exit 2
fi

failed=0

# check_route URL [check_body=1|0]
# Pages get the body-content check (catches error.tsx renders); APIs
# don't, since the error-boundary string would only appear in HTML.
check_route() {
  local route="$1"
  local check_body="${2:-0}"
  local label="${3:-$route}"

  local body_file
  body_file=$(mktemp)
  local code
  code=$(curl -s -o "$body_file" --max-time 30 -w "%{http_code}" "$BASE$route" || echo "000")

  if [ "$code" -lt 200 ] || [ "$code" -ge 400 ]; then
    printf "  FAIL %3s  %s\n" "$code" "$label"
    rm -f "$body_file"
    failed=$((failed + 1))
    return
  fi

  if [ "$check_body" = "1" ] && grep -q "$ERROR_BOUNDARY_MARKER" "$body_file"; then
    printf "  FAIL %3s  %s  (error boundary rendered)\n" "$code" "$label"
    rm -f "$body_file"
    failed=$((failed + 1))
    return
  fi

  printf "  ok   %3s  %s\n" "$code" "$label"
  rm -f "$body_file"
}

for route in "${PAGE_ROUTES[@]}"; do
  check_route "$route" 1
done
for route in "${API_ROUTES[@]}"; do
  check_route "$route" 0
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
    check_route "/api/people/$person_id" 0 "/api/people/<id>"
  fi
fi

total=$((${#PAGE_ROUTES[@]} + ${#API_ROUTES[@]} + dynamic_total))

echo ""
if [ "$failed" -gt 0 ]; then
  echo "✗ $failed/$total route(s) failed"
  exit 1
fi

echo "✓ all $total routes ok"
