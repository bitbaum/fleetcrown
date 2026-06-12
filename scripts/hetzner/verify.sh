#!/usr/bin/env bash
# Full-fleet verification sweep: systemd state + public HTTPS for every app
# in apps.conf plus the four pre-existing services. Exit 1 if anything fails.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
set +e   # we aggregate failures ourselves; set -e from lib.sh aborts the sweep

fail=0
check() { # name domain port
  local name=$1 domain=$2 port=$3 svc state code pub
  svc="$name-app"
  case "$name" in fleetcrown-bridge) svc="fleetcrown-bridge";; esac
  state=$(box "systemctl is-active $svc" 2>/dev/null | tr -d '[:space:]')
  code=$(box "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:$port/" 2>/dev/null | tr -d '[:space:]')
  if [ "$domain" != "-" ]; then
    pub=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 20 "https://${domain%%,*}/" 2>/dev/null)
  else
    pub="n/a"
  fi
  local ok="OK "
  if [ "$state" != "active" ]; then ok="FAIL"; fail=1; fi
  if [ "$pub" != "n/a" ] && [ "$pub" != "200" ]; then ok="FAIL"; fail=1; fi
  printf "%-4s %-22s systemd=%-8s local=%-4s public=%s\n" "$ok" "$name" "$state" "$code" "$pub"
}

# Pre-existing services (handcrafted units).
# The bridge serves SSE endpoints only — any HTTP answer (even 404 on /)
# proves liveness, so it gets its own check.
bridge_state=$(box "systemctl is-active fleetcrown-bridge" 2>/dev/null | tr -d '[:space:]')
bridge_pub=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://bridge.orangecat.ch/ 2>/dev/null)
if [ "$bridge_state" = "active" ] && [ "$bridge_pub" != "000" ]; then
  printf "%-4s %-22s systemd=%-8s public=%s (SSE service, 404 on / is normal)\n" "OK " fleetcrown-bridge "$bridge_state" "$bridge_pub"
else
  printf "%-4s %-22s systemd=%-8s public=%s\n" FAIL fleetcrown-bridge "$bridge_state" "$bridge_pub"; fail=1
fi
check fleetcrown fleetcrown.orangecat.ch 4002
check orangecat orangecat.ch 4003
check revampit revampit.orangecat.ch 4004

# Manifest apps
while IFS='|' read -r name port domains repo app_dir db; do
  case "$name" in \#*|"") continue;; esac
  check "$name" "$domains" "$port"
done < <(grep -v '^#' "$MANIFEST")

# Supabase stack
sb=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://supabase.orangecat.ch/auth/v1/settings -H "apikey: invalid" 2>/dev/null)
printf "%-4s %-22s public=%s (401/200 expected)\n" "$([ "$sb" = 401 ] || [ "$sb" = 200 ] && echo OK || { echo FAIL; fail=1; })" "supabase-stack" "$sb"

exit $fail
