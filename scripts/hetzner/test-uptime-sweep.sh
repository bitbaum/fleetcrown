#!/usr/bin/env bash
#
# Tests for the fleet uptime sweep — mostly for the two decisions that decide
# whether it can catch the outage it was written for.
#
# botsmann served 503 from /api/health while its HOMEPAGE served 200. So:
#
#   1. A 503 on the health route must read DOWN. If health_verdict ever softens
#      5xx into "absent" the sweep falls back to `/`, sees botsmann's 200, and
#      reports the fleet green through the exact outage that motivated it.
#   2. An app with no health route must read LIMITED, never UP. Eight apps have
#      no health route; calling their homepage check a pass would put a green
#      tick next to eight apps whose database could be on fire.
#
# Pure: no network, no box, no checkout.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/uptime-sweep.sh"
MANIFEST="$HERE/apps.conf"

PASS=0; FAIL=0
ok() { printf '  ✓ %s\n' "$1"; PASS=$((PASS + 1)); }
no() { printf '  ✗ %s\n' "$1"; FAIL=$((FAIL + 1)); }
eq() { [ "$1" = "$2" ] && ok "$3" || no "$3 (want '$1', got '$2')"; }

export UPTIME_SWEEP_LIB_ONLY=1
# shellcheck source=/dev/null
source "$SCRIPT"
unset UPTIME_SWEEP_LIB_ONLY

echo "health_verdict — what did /api/health tell us?"
eq up     "$(health_verdict 200)" "200 is the only pass"
eq down   "$(health_verdict 503)" "503 is DOWN — this is botsmann's exact code"
eq down   "$(health_verdict 500)" "500 is DOWN"
eq down   "$(health_verdict 000)" "000 (DNS/refused/timeout) is DOWN"
eq down   "$(health_verdict '')"  "an empty code is DOWN, not silently absent"
eq absent "$(health_verdict 404)" "404 means no health route — a question we cannot ask"
eq absent "$(health_verdict 308)" "a redirect handled it, so no health route here either"
eq absent "$(health_verdict 401)" "an auth-walled route is not a liveness signal"

echo
echo "root_verdict — the weaker fallback: does it serve anything?"
eq up   "$(root_verdict 200)" "200 serves"
eq up   "$(root_verdict 307)" "307 serves (petvity, vitareba redirect / to a locale)"
eq up   "$(root_verdict 308)" "308 serves (revampit redirects to its canonical host)"
eq down "$(root_verdict 404)" "404 on / is DOWN"
eq down "$(root_verdict 502)" "502 on / is DOWN"
eq down "$(root_verdict 000)" "unreachable is DOWN"

echo
echo "normalize_code — a failed probe must read as a FAILURE"
# The bug this pins was live in the first draft and cost a false LIMITED on a
# real sweep: `curl || echo 000` emits "000000", which matched no verdict and
# degraded to `absent`.
eq 000 "$(normalize_code 000000)" "curl's double-000 on failure normalises to 000, not garbage"
eq 000 "$(normalize_code '')"     "empty output is 000"
eq 000 "$(normalize_code 'curl: (28) timeout')" "an error string is 000"
eq 200 "$(normalize_code 200)"    "a real code passes through"
eq 503 "$(normalize_code 503)"    "503 passes through"
eq down "$(health_verdict "$(normalize_code 000000)")" \
  "end to end: an unreachable app reads DOWN, never 'no health route'"

echo
echo "a service that is not a Next app gets its own health path"
# bridge is an SSE fan-out service: it answers /healthz and 404s on `/` by
# design. Probing it the standard way reported a HEALTHY service as DOWN — the
# failure mode that teaches people to mute the monitor.
extra_targets | grep -q "^bridge	bridge.orangecat.ch	/healthz$" \
  && ok "bridge is probed at /healthz, not /api/health" \
  || no "bridge must declare its own health path"
extra_targets | grep -q "^orangecat	orangecat.ch	/api/health$" \
  && ok "a target with no declared path defaults to /api/health" \
  || no "the default health path was not applied"

echo
echo "manifest_targets — who gets probed"
targets="$(manifest_targets "$MANIFEST")"
count="$(printf '%s\n' "$targets" | grep -c . || true)"
[ "$count" -ge 10 ] && ok "reads the real manifest ($count apps)" \
  || no "expected 10+ apps from the manifest, got $count"

# The outage that motivated all of this must be in the probe set.
printf '%s\n' "$targets" | grep -q "^botsmann	botsmann.orangecat.ch	/api/health$" \
  && ok "botsmann is probed — the app whose 503 nobody saw" \
  || no "botsmann is missing from the probe set"

# Internal-only apps have no URL to probe; probing '-' would page forever.
printf '%s\n' "$targets" | grep -qv -- '	-	' \
  && ok "no target has '-' as its domain" \
  || no "an internal-only app leaked into the probe set"

# A comma list is one app, not two.
printf '%s\n' "$targets" | grep -q "^sink	sinktattoo.com	/api/health$" \
  && ok "a comma-separated domain list probes only the first (sink)" \
  || no "sink should probe sinktattoo.com, not the www alias too"

echo
echo "coverage is reported, never implied"
# Against a FIXTURE, not the live manifest: today no app is internal-only or
# archived, so asserting on apps.conf would assert on nothing and quietly pass
# forever. The exclusion logic still has to be right for the day one appears.
FIXTURE="$(mktemp)"
trap 'rm -f "$FIXTURE"' EXIT
cat > "$FIXTURE" <<'FIX'
# a comment line, and a blank line, both ignored

live-app|4100|live.example.com|/repo|.|db|bitbaum|product|live|-|-|-
internal|4101|-|/repo|.|db|bitbaum|infra|live|-|-|-
gone|4102|gone.example.com|/repo|.|db|bitbaum|product|archived|-|-|-
theirs|4103|theirs.example.com|/repo|.|db|Client|client-app|handed-over|-|-|-
FIX

fx_targets="$(manifest_targets "$FIXTURE")"
eq "live-app	live.example.com	/api/health" "$fx_targets" "only the live public app is probed"

fx_skipped="$(manifest_skipped "$FIXTURE")"
printf '%s\n' "$fx_skipped" | grep -q "^internal	internal-only" \
  && ok "an internal-only app is named as not probed, not silently dropped" \
  || no "internal-only app missing from the skip report"
printf '%s\n' "$fx_skipped" | grep -q "^gone	status=archived" \
  && ok "an archived app is named as not probed" \
  || no "archived app missing from the skip report"
printf '%s\n' "$fx_skipped" | grep -q "^theirs	status=handed-over" \
  && ok "a handed-over app is named as not probed" \
  || no "handed-over app missing from the skip report"

echo
echo "the EXTRA_TARGETS hand-list is built to die"
# apps.conf documents these four as deliberately absent. The day someone
# registers one, this test fails and forces the duplicate out of the script —
# so the hand-list cannot quietly outlive the reason it exists.
dupes=""
while IFS=$'\t' read -r name _domain; do
  [ -n "$name" ] || continue
  if printf '%s\n' "$targets" | grep -q "^${name}	"; then
    dupes="${dupes}${name} "
  fi
done <<<"$(extra_targets)"
[ -z "$dupes" ] \
  && ok "no EXTRA target duplicates a manifest app" \
  || no "now in apps.conf — delete from EXTRA_TARGETS: $dupes"

# And they must actually be covered, or the four apps apps.conf excludes stay
# exactly as unwatched as they were before this script existed.
extras="$(extra_targets | grep -c . || true)"
eq 4 "$extras" "the four pre-existing services apps.conf documents are covered"

echo
if [ "$FAIL" -gt 0 ]; then
  echo "FAILED: $FAIL failed, $PASS passed"
  exit 1
fi
echo "OK: $PASS passed"
