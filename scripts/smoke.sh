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

# Page routes — match config/navigation.ts NAV_ITEMS plus the / redirect
# and public-surface pages (/whitepaper).
PAGE_ROUTES=(
  "/"
  "/whitepaper"
  "/today"
  "/control"
  "/projects"
  "/goals"
  "/people"
  "/habits"
  "/events"
  "/money"
  "/history"
  "/prompts"
  "/system"
  "/memory"
  "/thoughts"
  "/settings"
)

# DB-backed API GETs. Exercises drizzle, the postgres connection, and the
# query layer — catches silent regressions a page-only smoke would miss.
# Tool-dependent endpoints (/api/calendar, /api/weather, /api/github) are
# omitted because they depend on the local Ivy gateway being up.
#
# AUTH_ROUTES require a valid session. Without one they return 401 (correct).
# We accept 200 OR 401 — either proves the route isn't crashing (500).
# Set COCKPIT_SESSION_TOKEN=<token> to run them fully authenticated.
PUBLIC_API_ROUTES=(
  "/api/health"
  "/api/crons"
  "/api/system"
  "/api/setup"
)
AUTH_API_ROUTES=(
  "/api/me"
  "/api/goals"
  "/api/habits"
  "/api/people"
  "/api/events"
  "/api/control"
  "/api/control/agent"
  "/api/control/commands"
  "/api/user-projects"
  "/api/invitations"
  "/api/sessions"
  "/api/prompts/agent"
  "/api/captures"
  "/api/beacon-settings"
  "/api/checkout/personal"
  "/api/orgs"
  "/api/agent-tokens"
  "/api/agent/register"
)

# Optional session cookie for authenticated smoke runs.
CURL_AUTH_ARGS=()
if [ -n "${COCKPIT_SESSION_TOKEN:-}" ]; then
  CURL_AUTH_ARGS=(-H "Cookie: authjs.session-token=${COCKPIT_SESSION_TOKEN}")
fi

# 1) Probe the base URL once so we fail fast with a clear message
# instead of dribbling out one curl error per route.
# 20s timeout: dev mode compiles on first request which can be slow.
if ! curl -s -o /dev/null --max-time 20 "$BASE/"; then
  echo "✗ no server reachable at $BASE — start the dev server first (npm run dev)" >&2
  exit 2
fi

failed=0

# check_route ROUTE [check_body=0] [label] [allow_401=0] [extra_ok_code=""]
check_route() {
  local route="$1"
  local check_body="${2:-0}"
  local label="${3:-$route}"
  local allow_401="${4:-0}"
  local extra_ok_code="${5:-}"

  local body_file
  body_file=$(mktemp)
  local code
  code=$(curl -s -o "$body_file" --max-time 30 "${CURL_AUTH_ARGS[@]}" \
    -w "%{http_code}" "$BASE$route" || echo "000")

  local ok=0
  if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
    ok=1
  elif [ "$allow_401" = "1" ] && [ "$code" = "401" ]; then
    ok=1
  elif [ -n "$extra_ok_code" ] && [ "$code" = "$extra_ok_code" ]; then
    ok=1
  fi

  if [ "$ok" = "0" ]; then
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
for route in "${PUBLIC_API_ROUTES[@]}"; do
  check_route "$route" 0
done
for route in "${AUTH_API_ROUTES[@]}"; do
  check_route "$route" 0 "$route" 1
done

# Routes that may return 503 when optional integrations (Stripe) are not configured.
# 401 (no session) or 503 (not configured) both prove the route isn't crashing.
check_route "/api/stripe/portal" 0 "/api/stripe/portal" 1 "503"

# Invitation token routes are excluded from the auth middleware so unauthenticated
# users can accept invites. A bogus token must return 404 — if it returns 401 the
# middleware exclusion regressed and new users can no longer accept invitations.
check_route "/api/invitations/smoke-test-bogus-token" 0 "/api/invitations/<token> (must not 401)" 0 "404"

# Dynamic [id] routes — discover an id from a list endpoint, then hit
# the detail route. Catches regressions in the parameter handlers and
# the per-row drizzle queries that the static-list smoke can't.
# Optional: skipped silently if jq isn't installed or the list is empty.
dynamic_total=0
if command -v jq >/dev/null 2>&1; then
  person_id=$(curl -s --max-time 5 "${CURL_AUTH_ARGS[@]}" "$BASE/api/people" 2>/dev/null \
    | jq -r '.people[0].id // empty' 2>/dev/null)
  if [ -n "$person_id" ]; then
    dynamic_total=$((dynamic_total + 1))
    check_route "/api/people/$person_id" 0 "/api/people/<id>" 1
  fi

  # /api/projects/[id] — GET is the hottest project route (every drawer open) but
  # static-list smoke can't cover it. Derive an entity project ID from user-projects.
  project_id=$(curl -s --max-time 5 "${CURL_AUTH_ARGS[@]}" "$BASE/api/user-projects" 2>/dev/null \
    | jq -r '.[0].entityProjectId // empty' 2>/dev/null)
  if [ -n "$project_id" ]; then
    dynamic_total=$((dynamic_total + 1))
    check_route "/api/projects/$project_id" 0 "/api/projects/<id>" 1
  fi
fi

total=$((${#PAGE_ROUTES[@]} + ${#PUBLIC_API_ROUTES[@]} + ${#AUTH_API_ROUTES[@]} + 2 + dynamic_total))

echo ""
if [ "$failed" -gt 0 ]; then
  echo "✗ $failed/$total route(s) failed"
  exit 1
fi

echo "✓ all $total routes ok"
