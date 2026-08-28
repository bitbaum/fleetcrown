#!/usr/bin/env bash
# Regression test for host-alert transition logic — runs anywhere, no box needed.
#
# Why this exists: on 2026-08-05 the box sent 40 "DISK 86%" / "✅ RECOVERED"
# pairs in three hours. Nothing was flapping. `alert_transition` ended with
#     [ "$state" = "ok" ] && alert "✅" "RECOVERED: $key"
# which returns 1 whenever state is `bad`, so the disk caller — written as
#     check && alert_transition disk bad ... || alert_transition disk ok ...
# treated a *successful* bad-alert as a failed check and immediately ran the
# `ok` branch, resetting the state file and re-alerting on the next tick.
#
# The alerting logic ships embedded in heredocs inside install-host-alerts.sh,
# so it had no way to be tested. This extracts those exact heredoc payloads —
# no second copy that can drift — and drives them with stubbed system tools.
#
# Usage: scripts/hetzner/test-host-alerts.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC="$HERE/install-host-alerts.sh"
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/state" "$TMP/bin"

# ── Extract the shipped payloads (strip the `cat <<'X'` and closing `X`) ──────
sed -n "/<<'LIB'\$/,/^LIB\$/p" "$SRC" | sed '1d;$d' > "$TMP/lib-alert.sh"
sed -n "/<<'HC'\$/,/^HC\$/p"   "$SRC" | sed '1d;$d' > "$TMP/host-check.sh"
sed -n "/<<'NF'\$/,/^NF\$/p"   "$SRC" | sed '1d;$d' > "$TMP/notify-failure.sh"
[ -s "$TMP/lib-alert.sh" ]  || { echo "FAIL: could not extract lib-alert.sh"; exit 1; }
[ -s "$TMP/host-check.sh" ] || { echo "FAIL: could not extract host-check.sh"; exit 1; }
[ -s "$TMP/notify-failure.sh" ] || { echo "FAIL: could not extract notify-failure.sh"; exit 1; }
chmod +x "$TMP/host-check.sh" "$TMP/notify-failure.sh"

# ── Stub the system tools host-check.sh shells out to ────────────────────────
# `alert` always calls logger, and telegram.env is absent here, so the logger
# stub is our capture of "an alert was sent".
cat > "$TMP/bin/logger" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${*: -1}" >> "$ALERT_LOG"
STUB
# Disk percentage is driven by $DISK_PCT so a test can park it anywhere.
cat > "$TMP/bin/df" <<'STUB'
#!/usr/bin/env bash
printf 'Use%%\n%s%%\n' "${DISK_PCT:-10}"
STUB
# Real `free -m` shape: the Mem row has SEVEN fields, the Swap row FOUR. Driven
# by env so a test can put the box under genuine memory pressure.
cat > "$TMP/bin/free" <<'STUB'
#!/usr/bin/env bash
echo "               total        used        free      shared  buff/cache   available"
echo "Mem:            7746        4462         264         165        3490        ${MEM_AVAIL:-11000}"
echo "Swap:           4095        ${SWAP_USED:-0}          14"
STUB
# Driven by $FAILED_UNITS so a test can fail specific units. Default empty =
# a healthy box, which is what every pre-existing test here assumes.
cat > "$TMP/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
# notify-failure.sh asks two things about the failed unit: its Type (oneshot
# units skip the recovery grace period) and whether it came back. Both are
# driven by env so a test can stage a crash loop or a deploy blip.
if [ "${1:-}" = "show" ]; then
  printf '%s\n' "${UNIT_TYPE:-simple}"; exit 0
fi
if [ "${1:-}" = "is-active" ]; then
  exit "${UNIT_ACTIVE:-1}"   # default 1 = still down, the crash-loop case
fi
if [ "${1:-}" = "list-units" ]; then
  # Reproduce systemd's REAL shape: a failed unit is printed with a leading
  # "●" unless --plain is passed. A stub without it let a bug ship that turned
  # every unit name into the bullet itself.
  plain=0; for a in "$@"; do [ "$a" = "--plain" ] && plain=1; done
  for u in ${FAILED_UNITS:-}; do
    if [ "$plain" = 1 ]; then echo "$u loaded failed failed stub"
    else echo "● $u loaded failed failed stub"; fi
  done
fi
exit 0
STUB
cat > "$TMP/bin/pg_isready" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$TMP/bin/journalctl" <<'STUB'
#!/usr/bin/env bash
echo "stub journal line"
STUB
# The notifier waits 8s before deciding a unit is really down. Tests assert the
# decision, not the wall clock — stub it out so the suite stays instant.
cat > "$TMP/bin/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$TMP/bin"/*
export PATH="$TMP/bin:$PATH"
export MON="$TMP"
export ALERT_LOG="$TMP/alerts.log"
: > "$ALERT_LOG"

pass=0 fail=0
check() { # name condition-as-exit-status
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); printf '  ✓ %s\n' "$1"
  else fail=$((fail + 1)); printf '  ✗ %s\n' "$1"; fi
}
run_check() { : > "$ALERT_LOG"; DISK_PCT="$1" bash "$TMP/host-check.sh" >/dev/null 2>&1 || true; }
# wc, not `grep -c || echo 0` — grep -c prints 0 *and* exits 1 on no match, so
# the fallback would emit a second 0 and every numeric compare would blow up.
alerts()   { wc -l < "$ALERT_LOG" | tr -d '[:space:]'; }
disk_state() { cat "$TMP/state/host_disk" 2>/dev/null || echo "<unset>"; }

echo "host-alert transition tests"

# ── 1. The exact storm: disk over threshold must alert ONCE, then stay quiet ──
printf '%s' ok > "$TMP/state/host_disk"
run_check 86
n1=$(alerts)
check "86%: alerts exactly once on the ok→bad flip (got $n1)" "$([ "$n1" -eq 1 ] && echo 0 || echo 1)"
check "86%: state file records bad, not ok (got $(disk_state))" \
  "$([ "$(disk_state)" = "bad" ] && echo 0 || echo 1)"
check "86%: the alert is the DISK warning, not a RECOVERED" \
  "$(grep -q 'DISK 86%' "$ALERT_LOG" && ! grep -q 'RECOVERED' "$ALERT_LOG" && echo 0 || echo 1)"

# The regression itself: a second tick at the same level must be silent.
run_check 86
n2=$(alerts)
check "86% again: silent on the second tick — no re-alert storm (got $n2)" \
  "$([ "$n2" -eq 0 ] && echo 0 || echo 1)"

run_check 86
n3=$(alerts)
check "86% third tick: still silent (got $n3)" "$([ "$n3" -eq 0 ] && echo 0 || echo 1)"

# ── 1b. Failed units: a NEW failure must alert even while an OLD one persists ──
# The six-week outage this replaces: the check asked "is anything failed?" and
# handed that one boolean to alert_transition. cloud-init-hotplugd failed on
# 2026-07-22 and never recovered, so the state was pinned at `bad` and NOTHING
# could transition again — every later failure was silent, including vitareba's
# crons dying on 2026-08-28. An aggregate over a set containing a permanent
# member cannot change. These cases pin the per-unit behaviour that fixes it.
# DISK_PCT is pinned inside the band so the disk check cannot contribute an
# alert to these counts — an earlier version of this test counted a disk
# RECOVERED as a unit alert and "failed" on correct behaviour.
run_units() { : > "$ALERT_LOG"; DISK_PCT=82 FAILED_UNITS="$1" bash "$TMP/host-check.sh" >/dev/null 2>&1 || true; }
unit_alerts() { grep -c 'FAILED UNIT\|RECOVERED: unit_' "$ALERT_LOG" 2>/dev/null | tr -d "[:space:]" || true; }
rm -f "$TMP"/state/host_unit_* "$TMP/state/host_units"

run_units "a.service b.service"
check "units: first failures alert once per unit (got $(unit_alerts))" \
  "$([ "$(unit_alerts)" -eq 2 ] && echo 0 || echo 1)"

run_units "a.service b.service"
check "units: identical set is silent — no storm (got $(unit_alerts))" \
  "$([ "$(unit_alerts)" -eq 0 ] && echo 0 || echo 1)"

# THE regression. A stuck unit must not mask a new one.
run_units "a.service b.service c.service"
check "units: a NEW failure alerts while old ones are still failing (got $(unit_alerts))" \
  "$([ "$(unit_alerts)" -eq 1 ] && grep -q 'c.service' "$ALERT_LOG" && echo 0 || echo 1)"

run_units "b.service c.service"
check "units: only the recovered unit reports RECOVERED" \
  "$(grep -q 'RECOVERED: unit_a_service' "$ALERT_LOG" && [ "$(unit_alerts)" -eq 1 ] && echo 0 || echo 1)"

run_units ""
check "units: the rest recover when the set empties (got $(unit_alerts))" \
  "$([ "$(unit_alerts)" -eq 2 ] && echo 0 || echo 1)"

check "units: the old aggregate latch file is not recreated" \
  "$([ ! -e "$TMP/state/host_units" ] && echo 0 || echo 1)"

# ── 2. alert_transition must never leak a branch exit status to a caller ──────
# This is the property that broke; assert it directly on the shipped function.
( set +e
  MON="$TMP" . "$TMP/lib-alert.sh"
  printf '%s' ok > "$TMP/state/host_rc"
  alert_transition rc bad "💾" "x"; rc_bad=$?
  printf '%s' bad > "$TMP/state/host_rc"
  alert_transition rc ok "" "";   rc_ok=$?
  printf '%s' bad > "$TMP/state/host_rc"
  alert_transition rc bad "💾" "x"; rc_same=$?
  [ "$rc_bad" -eq 0 ] && [ "$rc_ok" -eq 0 ] && [ "$rc_same" -eq 0 ]
) >/dev/null 2>&1
check "alert_transition returns 0 on every path (bad / ok / no-change)" $?

# ── 3. Hysteresis: 80–85% holds state instead of flapping ────────────────────
printf '%s' bad > "$TMP/state/host_disk"
run_check 83
check "83% while bad: holds bad, no premature RECOVERED (got $(disk_state))" \
  "$([ "$(disk_state)" = "bad" ] && [ "$(alerts)" -eq 0 ] && echo 0 || echo 1)"

printf '%s' ok > "$TMP/state/host_disk"
run_check 83
check "83% while ok: stays ok, does not page (got $(disk_state))" \
  "$([ "$(disk_state)" = "ok" ] && [ "$(alerts)" -eq 0 ] && echo 0 || echo 1)"

# ── 4. Real recovery still fires, exactly once ───────────────────────────────
printf '%s' bad > "$TMP/state/host_disk"
run_check 42
check "42%: recovers below the low-water mark" \
  "$(grep -q 'RECOVERED: disk' "$ALERT_LOG" && [ "$(disk_state)" = "ok" ] && echo 0 || echo 1)"
run_check 42
check "42% again: recovery is not repeated" "$([ "$(alerts)" -eq 0 ] && echo 0 || echo 1)"

# ── 5. Memory check must actually evaluate — not die on a parse error ────────
# `read -r _ _ _ _ _ avail` gave 6 vars for 7 Mem fields, so avail became
# "3490 3283", every [ -lt ] threw "integer expected", and the check reported ok
# forever. Assert BOTH that a healthy box is quiet and that a genuinely tight one
# actually pages — the second half is what the old code could never do.
mem_run() { # avail-MB swap-used-MB disk-pct
  : > "$ALERT_LOG"
  MEM_AVAIL="$1" SWAP_USED="$2" DISK_PCT="${3:-10}" \
    bash "$TMP/host-check.sh" 2>"$TMP/stderr.log" >/dev/null || true
}

printf '%s' ok > "$TMP/state/host_mem"; printf '%s' ok > "$TMP/state/host_disk"
mem_run 11000 0 10
check "healthy memory: no parse errors on stderr" \
  "$([ ! -s "$TMP/stderr.log" ] && echo 0 || echo 1)"
check "healthy memory: stays quiet" "$([ "$(alerts)" -eq 0 ] && echo 0 || echo 1)"

# avail 300MB (<400) AND swap 4000/4095 (>90%) = the real-pressure condition.
mem_run 300 4000 10
check "tight memory: pages instead of silently passing" \
  "$(grep -q 'MEM tight' "$ALERT_LOG" && echo 0 || echo 1)"
check "tight memory: reports the available MB as a single number" \
  "$(grep -qE 'MEM tight: 300MB avail, swap 9[0-9]%' "$ALERT_LOG" && echo 0 || echo 1)"
check "tight memory: no 'integer expected' from field-count drift" \
  "$(! grep -q 'integer expected' "$TMP/stderr.log" && echo 0 || echo 1)"

# ── the bullet: systemd prefixes a failed unit with "●" without --plain -------
# Shipped once as `FAILED UNIT: ●`, one shared key for every failure. The stub
# above now emits the bullet, so this is a real regression test.
run_units "z.service"
check "units: the unit NAME is alerted, not systemd's bullet" \
  "$(grep -q 'FAILED UNIT: z.service' "$ALERT_LOG" && ! grep -q 'FAILED UNIT: ●' "$ALERT_LOG" && echo 0 || echo 1)"
check "units: the state key is derived from the name, not the bullet" \
  "$([ -e "$TMP/state/host_unit_z_service" ] && echo 0 || echo 1)"

# ── 6. OnFailure notifier: one incident is ONE page, not one per restart ──────
# On 2026-08-28 vitareba-app could not read its .env (root-owned after a
# `chown --reference`). Restart=on-failure + RestartSec=3 restarted it 18 times
# in 60 seconds and every restart fired OnFailure → SIX identical "UNIT DOWN"
# Telegrams for a single incident. The pre-existing recovery guard could not
# help: it only silences a unit that comes back, and this one never did. These
# cases pin the per-unit cooldown that fixes it.
notify() { : > "$ALERT_LOG"; bash "$TMP/notify-failure.sh" "$1" >/dev/null 2>&1 || true; }
pages() { grep -c 'UNIT DOWN' "$ALERT_LOG" 2>/dev/null | tr -d "[:space:]" || true; }
stamp_of() { echo "$TMP/state/paged_$(printf '%s' "$1" | tr -c 'a-zA-Z0-9' '_')"; }
rm -f "$TMP"/state/paged_*

notify vitareba-app.service
check "notifier: a unit that stays down pages once (got $(pages))" \
  "$([ "$(pages)" -eq 1 ] && echo 0 || echo 1)"

# THE storm. Same unit, next restart three seconds later.
notify vitareba-app.service
n_loop=$(pages)
check "notifier: the next crash-loop restart is silent (got $n_loop)" \
  "$([ "$n_loop" -eq 0 ] && echo 0 || echo 1)"
notify vitareba-app.service
check "notifier: and the one after that (got $(pages))" \
  "$([ "$(pages)" -eq 0 ] && echo 0 || echo 1)"

# Silence in Telegram must not mean silence in the journal — the suppressed
# restarts still have to be visible to whoever reads the logs afterwards.
check "notifier: suppressed restarts are still journalled, not dropped" \
  "$(grep -q 'still failing' "$ALERT_LOG" && echo 0 || echo 1)"

# A different unit is a different incident — one loop must not mute the fleet.
notify restic-check.service
check "notifier: a DIFFERENT unit still pages while the first is muted" \
  "$([ "$(pages)" -eq 1 ] && grep -q 'restic-check' "$ALERT_LOG" && echo 0 || echo 1)"

# Still down when the cooldown expires: re-page as a reminder.
printf '%s' "$(( $(date +%s) - 4000 ))" > "$(stamp_of vitareba-app.service)"
notify vitareba-app.service
check "notifier: re-pages as a reminder once the cooldown expires" \
  "$([ "$(pages)" -eq 1 ] && echo 0 || echo 1)"

# Recovery: no page, AND the stamp is cleared so the NEXT outage is not muted
# by the last one's cooldown. Both halves matter — clearing without the guard
# would restore the storm; guarding without the clearing would swallow a real
# outage that happened to land inside the window.
UNIT_ACTIVE=0 notify vitareba-app.service
check "notifier: a unit that comes back does not page" \
  "$([ "$(pages)" -eq 0 ] && echo 0 || echo 1)"
check "notifier: recovery clears the cooldown stamp" \
  "$([ ! -e "$(stamp_of vitareba-app.service)" ] && echo 0 || echo 1)"
notify vitareba-app.service
check "notifier: a fresh outage after a recovery pages immediately" \
  "$([ "$(pages)" -eq 1 ] && echo 0 || echo 1)"

# oneshot units (appcron jobs) never go active, so they must skip the recovery
# grace period entirely and page on the first failure.
rm -f "$TMP"/state/paged_*
UNIT_TYPE=oneshot notify appcron-vitareba-reminders.service
check "notifier: a failed oneshot cron pages on the first failure" \
  "$([ "$(pages)" -eq 1 ] && echo 0 || echo 1)"

printf '\n  %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
