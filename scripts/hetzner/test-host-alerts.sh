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
[ -s "$TMP/lib-alert.sh" ]  || { echo "FAIL: could not extract lib-alert.sh"; exit 1; }
[ -s "$TMP/host-check.sh" ] || { echo "FAIL: could not extract host-check.sh"; exit 1; }
chmod +x "$TMP/host-check.sh"

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
cat > "$TMP/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$TMP/bin/pg_isready" <<'STUB'
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

echo
echo "  ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
