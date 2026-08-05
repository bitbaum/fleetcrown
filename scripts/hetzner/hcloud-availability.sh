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
MON="${MON:-/opt/monitoring}"
LOC="${HCLOUD_LOC:-fsn1}"          # bitbaum's location (Falkenstein)
SERVER="${HCLOUD_SERVER:-bitbaum}"
# type name -> hcloud server_type id  (cx43 = 16GB is the recommended target)
CX43_ID=116
CX53_ID=117

. "$MON/hcloud.env" 2>/dev/null || { logger -t hcloud-watch "no /opt/monitoring/hcloud.env token"; exit 0; }
. "$MON/lib-alert.sh"      # provides alert()
[ -n "${HCLOUD_TOKEN:-}" ] || { logger -t hcloud-watch "empty HCLOUD_TOKEN"; exit 0; }

STATE="$MON/state/hcloud_rescale"
# Structured sibling of $STATE, rewritten on EVERY run (not only on transition)
# so /api/system/hetzner can show an honest "checked N min ago". Specs come from
# the API, never hardcoded here — the card must not invent vCPU/RAM/disk numbers.
STATE_JSON="$MON/state/hcloud_rescale.json"
mkdir -p "$MON/state"

api() { curl -fsS -m 25 -H "Authorization: Bearer $HCLOUD_TOKEN" "https://api.hetzner.cloud/v1/$1" 2>/dev/null; }
json=$(api datacenters) || { logger -t hcloud-watch "API fetch failed"; exit 0; }
types_json=$(api server_types || echo '{}')
servers_json=$(api servers || echo '{}')

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

# ── Structured state for the FleetCrown /system card ────────────────────────
# Written on EVERY run so the UI can say how fresh the reading is. Specs are
# taken from the API response, so the card never displays invented hardware
# numbers. Best-effort: a failure here must not stop the Telegram alerting below.
tmpd=$(mktemp -d) && {
  printf '%s' "$json"         > "$tmpd/dc.json"
  printf '%s' "$types_json"   > "$tmpd/types.json"
  printf '%s' "$servers_json" > "$tmpd/servers.json"
  DIR="$tmpd" OUT="$STATE_JSON" LOC="$LOC" SERVER="$SERVER" C43="$CX43_ID" C53="$CX53_ID" python3 <<'PY' 2>/dev/null || logger -t hcloud-watch "json state write failed"
import json, os, datetime
d = os.environ["DIR"]
def load(name):
    try:
        with open(f"{d}/{name}") as fh: return json.load(fh)
    except Exception: return {}
dc, types, servers = load("dc.json"), load("types.json"), load("servers.json")
loc, server = os.environ["LOC"], os.environ["SERVER"]
target_ids = [int(os.environ["C43"]), int(os.environ["C53"])]

migratable = set()
for entry in dc.get("datacenters", []):
    if entry.get("location", {}).get("name") != loc: continue
    migratable |= set(entry.get("server_types", {}).get("available_for_migration", []))

spec = {t["id"]: t for t in types.get("server_types", []) if "id" in t}
def describe(tid, **extra):
    t = spec.get(tid, {})
    return {"id": tid, "name": t.get("name"), "cores": t.get("cores"),
            "memoryGb": t.get("memory"), "diskGb": t.get("disk"), **extra}

current = None
for s in servers.get("servers", []):
    if s.get("name") == server:
        st = s.get("server_type") or {}
        current = {"id": st.get("id"), "name": st.get("name"), "cores": st.get("cores"),
                   "memoryGb": st.get("memory"), "diskGb": st.get("disk")}
        break

out = {
    "server": server, "location": loc,
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "current": current,
    "targets": [describe(i, available=(i in migratable)) for i in target_ids],
}
with open(os.environ["OUT"], "w") as fh: json.dump(out, fh)
PY
  rm -rf "$tmpd"
}

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
