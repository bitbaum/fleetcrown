#!/usr/bin/env bash
# Alert (Telegram) when a bigger server type becomes AVAILABLE FOR MIGRATION in
# bitbaum's location, so George can seize the capacity window and rescale.
#
# Why this exists: Falkenstein (fsn1) is capacity-blocked for cx-line rescales —
# the console LISTS cx43/cx53 as valid targets ("supported"), but the API's
# available_for_migration is empty, so a rescale actually fails. This polls the
# real signal and pings the moment it opens. Windows can be brief.
#
# Read-only hcloud token in /opt/monitoring/hcloud.env; alert via the watchdog's
# Telegram (lib-alert.sh). Transition-only (state file) so it pings once on open
# and once on close, not every tick.
set -uo pipefail
MON=/opt/monitoring
LOC="fsn1"                 # bitbaum's location (Falkenstein)
# type name -> hcloud server_type id  (cx43 = 16GB is the recommended target)
CX43_ID=116
CX53_ID=117

. "$MON/hcloud.env" 2>/dev/null || { logger -t hcloud-watch "no /opt/monitoring/hcloud.env token"; exit 0; }
. "$MON/lib-alert.sh"      # provides alert()
[ -n "${HCLOUD_TOKEN:-}" ] || { logger -t hcloud-watch "empty HCLOUD_TOKEN"; exit 0; }

STATE="$MON/state/hcloud_rescale"
mkdir -p "$MON/state"

json=$(curl -fsS -m 25 -H "Authorization: Bearer $HCLOUD_TOKEN" \
  "https://api.hetzner.cloud/v1/datacenters" 2>/dev/null) || { logger -t hcloud-watch "API fetch failed"; exit 0; }

# Emit "cx43 cx53" flags (yes/no) for whether each is migratable in any DC in LOC.
read -r cx43 cx53 <<<"$(printf '%s' "$json" | LOC="$LOC" C43="$CX43_ID" C53="$CX53_ID" python3 -c '
import json,os,sys
d=json.load(sys.stdin); loc=os.environ["LOC"]
c43=int(os.environ["C43"]); c53=int(os.environ["C53"])
a43=a53=False
for dc in d.get("datacenters",[]):
    if dc["location"]["name"]!=loc: continue
    m=set(dc.get("server_types",{}).get("available_for_migration",[]))
    if c43 in m: a43=True
    if c53 in m: a53=True
print(("yes" if a43 else "no"), ("yes" if a53 else "no"))
' 2>/dev/null)"
[ -n "${cx43:-}" ] || { logger -t hcloud-watch "parse failed"; exit 0; }

now="cx43=$cx43 cx53=$cx53"
prev="cx43=no cx53=no"; [ -f "$STATE" ] && prev=$(cat "$STATE")
[ "$now" = "$prev" ] && exit 0     # no change → silent
printf '%s' "$now" > "$STATE"

if [ "$cx43" = "yes" ]; then
  alert "🟢" "Hetzner: cx43 (16GB) is AVAILABLE to rescale bitbaum in ${LOC} NOW. Grab it before the window closes: Console → bitbaum → Rescale → cx43 → keep disk → power-cycle."
elif [ "$cx53" = "yes" ]; then
  alert "🟢" "Hetzner: cx53 (32GB) available for rescale in ${LOC} (cx43 still not). Bigger jump but it's an upgrade path if you want it."
else
  alert "⚪" "Hetzner: bitbaum rescale capacity in ${LOC} closed again (cx43/cx53 no longer migratable)."
fi
