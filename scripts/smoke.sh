#!/usr/bin/env bash
# Smoke test: hit every page route and fail if navigation does not end at its
# catalogued semantic destination, if an auth-only route fails to reject an
# anonymous request, or if a rendered body contains an error-boundary marker.
# Usage: npm run smoke   (defaults to http://localhost:3000)
#        BASE=https://cockpit.example.com npm run smoke
#
# Page routes are derived from src/app/**/page.tsx by the dependency-free
# page-route catalog. Navigation config is intentionally not the route source
# of truth: public, auth, setup, compatibility, and dynamic pages also matter.

set -u

BASE="${BASE:-http://localhost:3000}"
BASE="${BASE%/}"

# String that src/app/error.tsx renders when a Server Component throws.
# Page responses still carry HTTP 200 in that case, so status-only
# checking misses the regression — body grep is the correction.
ERROR_BOUNDARY_MARKER="Something went wrong"

# Page routes come from the App Router filesystem (the route SSOT). Static
# pages and safe non-mutating dynamic fixtures are included automatically;
# data-owned dynamic routes (/projects/[id], /share/project/[token], and
# /u/[username]) are exercised below when a runtime fixture is discoverable.
route_output="$(node scripts/page-route-catalog.mjs --audit-tsv)" || {
  echo "✗ could not discover page routes" >&2
  exit 2
}
mapfile -t PAGE_ROUTE_ROWS <<< "$route_output"

# DB-backed API GETs. Exercises drizzle, the postgres connection, and the
# query layer — catches silent regressions a page-only smoke would miss.
# Tool-dependent endpoints (/api/calendar, /api/weather, /api/github) are
# omitted from unauthenticated smoke — calendar needs local `gog` on a runtime host;
# weather uses open-meteo on cloud or weather.sh locally.
#
# AUTH_ROUTES require a valid session. Without one they return 401 (correct).
# We accept 200 OR 401 — either proves the route isn't crashing (500).
# Set FLEETCROWN_SESSION_TOKEN=<token> to run them fully authenticated.
# COCKPIT_SESSION_TOKEN is still accepted (legacy).
PUBLIC_API_ROUTES=(
  "/api/health"
  "/api/system"
  "/api/setup"
)
AUTH_API_ROUTES=(
  "/api/me"
  "/api/onboarding"
  "/api/crons"
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
# HTTPS deployments use the __Secure- prefixed Auth.js cookie name.
CURL_AUTH_ARGS=()
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/_brand.sh"
SMOKE_SESSION_TOKEN="$(_brand_env SESSION_TOKEN)"
if [ -n "${SMOKE_SESSION_TOKEN}" ]; then
  if [[ "${BASE}" == https://* ]]; then
    CURL_AUTH_ARGS=(-H "Cookie: __Secure-authjs.session-token=${SMOKE_SESSION_TOKEN}")
  else
    CURL_AUTH_ARGS=(-H "Cookie: authjs.session-token=${SMOKE_SESSION_TOKEN}")
  fi
fi

# 1) Probe the base URL once so we fail fast with a clear message
# instead of dribbling out one curl error per route.
# 20s timeout: dev mode compiles on first request which can be slow.
if ! curl -s -o /dev/null --max-time 20 "$BASE/"; then
  echo "✗ no server reachable at $BASE — start the dev server first (npm run dev)" >&2
  exit 2
fi

failed=0
page_total=0
authenticated_page_skips=0

path_and_query_from_url() {
  local value="$1"
  value="${value#*://}"
  value="/${value#*/}"
  value="${value%%\#*}"
  local path="${value%%\?*}"
  local query=""
  if [[ "$value" == *\?* ]]; then query="?${value#*\?}"; fi
  if [ "$path" != "/" ]; then path="${path%/}"; fi
  value="$path$query"
  printf "%s" "$value"
}

expected_contains() {
  local actual="$1"
  local expected_csv="$2"
  local candidate
  IFS=',' read -r -a candidates <<< "$expected_csv"
  for candidate in "${candidates[@]}"; do
    if [ "$actual" = "$candidate" ]; then return 0; fi
  done
  return 1
}

check_auth_boundary() {
  local route="$1"
  local pattern="$2"
  local headers
  headers=$(mktemp)
  local code
  code=$(curl -sS -o /dev/null -D "$headers" --max-time 30 -w "%{http_code}" "$BASE$route" || echo "000")
  local location
  location=$(awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }' "$headers")
  local location_value=""
  if [ -n "$location" ]; then location_value=$(path_and_query_from_url "$location"); fi
  rm -f "$headers"
  local expected_callback="/sign-in?callbackUrl=$(node -p 'encodeURIComponent(process.argv[1])' "$route")"
  if [[ "$code" =~ ^3 ]] && [ "$location_value" = "$expected_callback" ]; then
    printf "  ok   %3s  %-34s anonymous → %s\n" "$code" "$pattern" "$expected_callback"
  else
    printf "  FAIL %3s  %-34s expected %s, got %s\n" "$code" "$pattern" "$expected_callback" "${location_value:-no-location}"
    failed=$((failed + 1))
  fi
}

check_page_navigation() {
  local route="$1"
  local pattern="$2"
  local expected_csv="$3"
  local access="$4"
  local mode="$5"
  local body_file
  body_file=$(mktemp)
  local -a auth_args=()
  if [ "$access" = "authenticated" ]; then auth_args=("${CURL_AUTH_ARGS[@]}"); fi
  local meta
  meta=$(curl -sS -L -o "$body_file" --max-time 45 "${auth_args[@]}" \
    -w "%{http_code}|%{url_effective}" "$BASE$route" || echo "000|$BASE$route")
  local code="${meta%%|*}"
  local final_url="${meta#*|}"
  local final_path
  final_path=$(path_and_query_from_url "$final_url")
  local allowed="$expected_csv"
  if [ -z "$allowed" ]; then allowed="$route"; fi
  # These are client-side state transitions. curl verifies their safe shell;
  # Playwright is responsible for the post-hydration terminal destination.
  if [ "$mode" = "isolated-action" ] || [ "$pattern" = "/onboarding" ]; then
    allowed="$allowed,$route"
  fi

  local reason=""
  if [ "$code" -lt 200 ] || [ "$code" -ge 400 ]; then
    reason="status $code"
  elif ! expected_contains "$final_path" "$allowed"; then
    reason="ended at $final_path; expected $allowed"
  elif rg -q "$ERROR_BOUNDARY_MARKER" "$body_file"; then
    reason="app error boundary rendered"
  fi
  rm -f "$body_file"
  if [ -n "$reason" ]; then
    printf "  FAIL %3s  %-34s %s\n" "$code" "$pattern" "$reason"
    failed=$((failed + 1))
  else
    printf "  ok   %3s  %-34s → %s\n" "$code" "$pattern" "$final_path"
  fi
}

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

for row in "${PAGE_ROUTE_ROWS[@]}"; do
  IFS='|' read -r access pattern route expected_finals audit_mode <<< "$row"
  page_total=$((page_total + 1))
  if [ "$access" = "authenticated" ]; then
    check_auth_boundary "$route" "$pattern"
    if [ -z "$SMOKE_SESSION_TOKEN" ]; then
      authenticated_page_skips=$((authenticated_page_skips + 1))
      continue
    fi
  fi
  check_page_navigation "$route" "$pattern" "$expected_finals" "$access" "$audit_mode"
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
dynamic_page_unresolved=3
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
    dynamic_total=$((dynamic_total + 2))
    dynamic_page_unresolved=$((dynamic_page_unresolved - 1))
    check_route "/api/projects/$project_id" 0 "/api/projects/<id>" 1
    check_route "/projects/$project_id" 1 "/projects/<id>"

    share_token=$(curl -s --max-time 5 "${CURL_AUTH_ARGS[@]}" "$BASE/api/projects/$project_id/share" 2>/dev/null \
      | jq -r '.share.token // empty' 2>/dev/null)
    if [ -n "$share_token" ]; then
      dynamic_total=$((dynamic_total + 1))
      dynamic_page_unresolved=$((dynamic_page_unresolved - 1))
      check_route "/share/project/$share_token" 1 "/share/project/<token>"
    fi
  fi

  username=$(curl -s --max-time 5 "${CURL_AUTH_ARGS[@]}" "$BASE/api/me" 2>/dev/null \
    | jq -r '.username // empty' 2>/dev/null)
  if [ -n "$username" ]; then
    dynamic_total=$((dynamic_total + 1))
    dynamic_page_unresolved=$((dynamic_page_unresolved - 1))
    check_route "/u/$username" 1 "/u/<username>"
  fi
fi

total=$((page_total + ${#PUBLIC_API_ROUTES[@]} + ${#AUTH_API_ROUTES[@]} + 2 + dynamic_total))

echo ""
if [ "$dynamic_page_unresolved" -gt 0 ]; then
  echo "ℹ $dynamic_page_unresolved/3 data-owned dynamic page interiors unresolved (/projects/[id], /share/project/[token], /u/[username])"
  if [ "${SMOKE_STRICT_FIXTURES:-0}" = "1" ]; then
    echo "  FAIL strict fixture mode requires all three dynamic page interiors"
    failed=$((failed + dynamic_page_unresolved))
  else
    echo "  Set a valid FLEETCROWN_SESSION_TOKEN and SMOKE_STRICT_FIXTURES=1 to require them in smoke; the authenticated browser audit is strict by default."
  fi
fi
if [ "$failed" -gt 0 ]; then
  echo "✗ $failed/$total route(s) failed"
  exit 1
fi

if [ "$authenticated_page_skips" -gt 0 ]; then
  echo "✓ all resolved checks passed; $authenticated_page_skips authenticated interiors were not exercised (set FLEETCROWN_SESSION_TOKEN)"
  echo "  Anonymous access boundaries for those routes were asserted."
else
  echo "✓ all $total route checks passed, including authenticated interiors"
fi
