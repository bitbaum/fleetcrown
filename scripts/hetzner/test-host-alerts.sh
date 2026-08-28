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
  # Answer the property actually asked for. A stub that returns the same string
  # for every -p is how a Result check can silently read a Type.
  prop=""; for a in "$@"; do case "$a" in -p) prop="NEXT";; *) [ "$prop" = "NEXT" ] && { prop="$a"; break; };; esac; done
  case "$prop" in
    Type)   printf '%s\n' "${UNIT_TYPE:-simple}" ;;
    Result) printf '%s\n' "${UNIT_RESULT:-exit-code}" ;;
    User)   printf '%s\n' "${UNIT_USER:-}" ;;
    *)      printf '%s\n' "${UNIT_TYPE:-simple}" ;;
  esac
  exit 0
fi
if [ "${1:-}" = "is-active" ]; then
  # Print the state as well as exiting with it: --quiet callers ignore stdout,
  # but the oneshot retry-grace and the env repair both READ this value.
  [ "${UNIT_ACTIVE:-1}" = 0 ] && echo active || echo failed
  exit "${UNIT_ACTIVE:-1}"   # default 1 = still down, the crash-loop case
fi
if [ "${1:-}" = "list-unit-files" ]; then
  for u in ${APP_UNITS:-}; do echo "$u enabled enabled"; done
  exit 0
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
# DELIVERY capture. logger records what reaches the JOURNAL; curl records what
# reaches the PHONE. Every suppression in lib-alert.sh is defined as "journal
# yes, phone no", so a suite that can only observe the journal cannot tell a
# correctly-suppressed duplicate from a delivered one — and a phone receiving
# six copies of one fact is the entire bug being fixed here.
cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in text=*) printf '%s\n' "${a#text=}" >> "$SEND_LOG";; esac; done
exit 0
STUB
# Fake creds so the delivery branch is actually entered. The curl stub above is
# where they land, so nothing leaves this machine.
printf 'TELEGRAM_BOT_TOKEN=test-token\nTELEGRAM_CHAT_ID=test-chat\n' > "$TMP/telegram.env"
# host-check asks "can this unit's User read its .env?" via sudo. Here we run as
# ourselves, so the answer is the real filesystem's — which is the point: the
# repair is tested against actual permission bits, not against a mock's opinion.
cat > "$TMP/bin/sudo" <<'STUB'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do
  case "$1" in -n) shift;; -u) shift 2;; *) break;; esac
done
exec "$@"
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
export SEND_LOG="$TMP/sent.log"
: > "$ALERT_LOG"; : > "$SEND_LOG"

pass=0 fail=0
check() { # name condition-as-exit-status
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); printf '  ✓ %s\n' "$1"
  else fail=$((fail + 1)); printf '  ✗ %s\n' "$1"; fi
}
run_check() { : > "$ALERT_LOG"; DISK_PCT="$1" bash "$TMP/host-check.sh" >/dev/null 2>&1 || true; }
# wc, not `grep -c || echo 0` — grep -c prints 0 *and* exits 1 on no match, so
# the fallback would emit a second 0 and every numeric compare would blow up.
alerts()   { wc -l < "$ALERT_LOG" | tr -d '[:space:]'; }
# What actually reached the phone, as opposed to the journal. Noise assertions
# must use this one: the journal deliberately keeps a line for every suppressed
# alert, so counting journal lines scores correct suppression as a message sent.
sent()     { wc -l < "$SEND_LOG" | tr -d '[:space:]'; }
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
  "$(grep -q 'ALERT held for vitareba-app.service' "$ALERT_LOG" && echo 0 || echo 1)"

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

# ── 7. The duplicate floor: identical text cannot reach the phone twice ──────
# On 2026-08-28 the fleet register check sent the SAME four-line failure at
# 22:15 and again at 22:16, because it had its own private Telegram call and no
# state of any kind. Keyed cooldowns cannot help a caller that passes no key,
# so lib-alert puts a floor under every unkeyed send. Note what is asserted:
# delivered ONCE, journalled BOTH times. Suppressed must never mean invisible.
# export, NOT a `VAR=x . lib.sh` prefix: bash discards assignments made in front
# of the `.` builtin as soon as it returns, so the library would be sourced with
# the right values and then RUN with them unset — which under `set -u` kills the
# call outright and looks exactly like successful suppression. Cost an hour once;
# it is why the tests below assert the journal as well as the delivery.
lib() { ( export MON="$TMP" ALERT_DEDUPE_SEC="${DEDUPE:-300}" ALERT_DRY_RUN="${DRY:-}"
          . "$TMP/lib-alert.sh"; "$@" ) >/dev/null 2>&1 || true; }
reset_logs() { : > "$ALERT_LOG"; : > "$SEND_LOG"; rm -f "$TMP"/state/dedupe_* "$TMP"/state/paged_*; }

reset_logs
lib alert "🔴" "register check failed: substrata port 4022 already taken"
lib alert "🔴" "register check failed: substrata port 4022 already taken"
check "floor: the same message is delivered once, not twice (got $(sent))" \
  "$([ "$(sent)" -eq 1 ] && echo 0 || echo 1)"
check "floor: the suppressed copy is still in the journal" \
  "$(grep -q 'duplicate suppressed' "$ALERT_LOG" && echo 0 || echo 1)"

# The floor must not become a gag: a DIFFERENT message still gets through.
reset_logs
lib alert "🔴" "first thing"
lib alert "🔴" "a genuinely different thing"
check "floor: a different message still reaches the phone (got $(sent))" \
  "$([ "$(sent)" -eq 2 ] && echo 0 || echo 1)"

# And it must expire — same text, window elapsed, is news again.
reset_logs
DEDUPE=0 lib alert "🔴" "recurring condition"
DEDUPE=0 lib alert "🔴" "recurring condition"
check "floor: expires, so a later recurrence is not swallowed (got $(sent))" \
  "$([ "$(sent)" -eq 2 ] && echo 0 || echo 1)"

# The floor applies ONLY to the unkeyed path. A keyed sender has already made a
# deliberate, state-backed decision to speak; running it through the floor too
# would mean two mechanisms arguing about one message and the quieter one
# silently winning — e.g. the notifier's still-broken reminder disappearing
# because the text matched the page from half an hour earlier.
reset_logs
lib alert_once svc 1800 "🔴" "UNIT DOWN: identical text"
lib alert_clear svc
lib alert_once svc 1800 "🔴" "UNIT DOWN: identical text"
check "floor: a keyed sender is not gagged by the unkeyed floor (got $(sent))" \
  "$([ "$(sent)" -eq 2 ] && echo 0 || echo 1)"

# ── 8. ALERT_DRY_RUN: testing the alerter must not page a human ──────────────
# At 22:14 and 22:15 on 2026-08-28 a one-time test of a new check and a planted
# zz-audit-probe.service both rang George's real phone — messages about
# nothing, from work that was going fine. Probes journal; they do not deliver.
reset_logs
DRY=1 lib alert "🔴" "one-time test of the new scheduled check"
check "dry-run: a test send delivers nothing (got $(sent))" \
  "$([ "$(sent)" -eq 0 ] && echo 0 || echo 1)"
check "dry-run: but is still visible in the journal" \
  "$(grep -q 'not delivered' "$ALERT_LOG" && echo 0 || echo 1)"

# ── 9. alert_once / alert_clear contract ─────────────────────────────────────
reset_logs
lib alert_once k 1800 "🔴" "x"; lib alert_once k 1800 "🔴" "x"
check "alert_once: second call inside the cooldown is silent (got $(sent))" \
  "$([ "$(sent)" -eq 1 ] && echo 0 || echo 1)"
( set +e
  MON="$TMP" . "$TMP/lib-alert.sh"
  alert_once rc 1800 "x" "y"; a=$?
  alert_once rc 1800 "x" "y"; b=$?
  alert_clear rc;             c=$?
  [ "$a" -eq 0 ] && [ "$b" -eq 0 ] && [ "$c" -eq 0 ]
) >/dev/null 2>&1
check "alert_once/alert_clear return 0 on every path" $?

# ── 10. A oneshot a retry already fixed is not an incident ───────────────────
# restic-check failed at 18:41:42 on a 25-day-old stale lock left by the laptop,
# was re-run at 18:42:28 and finished clean at 18:44:46 — and still paged,
# because OnFailure fires on the failing run and nothing ever looked again.
rm -f "$TMP"/state/paged_*
UNIT_TYPE=oneshot UNIT_ACTIVE=0 notify restic-check.service
check "oneshot: a retry already running does not page (got $(pages))" \
  "$([ "$(pages)" -eq 0 ] && echo 0 || echo 1)"

rm -f "$TMP"/state/paged_*
UNIT_TYPE=oneshot UNIT_ACTIVE=1 UNIT_RESULT=success notify restic-check.service
check "oneshot: a retry that already succeeded does not page (got $(pages))" \
  "$([ "$(pages)" -eq 0 ] && echo 0 || echo 1)"
check "oneshot: the grace path leaves no stamp to mute the next real failure" \
  "$([ ! -e "$(stamp_of restic-check.service)" ] && echo 0 || echo 1)"

# The half that must survive: a oneshot that is STILL broken after the grace
# window is a real failure and must page. A guard against noise that swallows
# the signal is the worse bug of the two.
rm -f "$TMP"/state/paged_*
UNIT_TYPE=oneshot UNIT_ACTIVE=1 UNIT_RESULT=exit-code notify restic-check.service
check "oneshot: one that is still failing after the grace DOES page (got $(pages))" \
  "$([ "$(pages)" -eq 1 ] && echo 0 || echo 1)"

# ── 11. Unreadable .env: repaired and reported, not asked about ──────────────
# Twice on 2026-08-28 an app's /opt/<app>/shared/.env ended up root-owned while
# the unit runs as ubuntu — vitareba at 18:38, botsmann at 20:16. Neither could
# boot, both crash-looped, and the only signal was a wall of UNIT DOWN messages
# whose remedy was one deterministic command. The owner is not a guess: it is
# the unit's own User=. So the check repairs it and reports what it did.
mkdir -p "$TMP/opt/demo/shared"
cat > "$TMP/bin/chown" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CHOWN_LOG"
[ -n "${CHOWN_FAIL:-}" ] && exit 1
exit 0
STUB
chmod +x "$TMP/bin/chown"
export CHOWN_LOG="$TMP/chown.log"

env_run() { # run host-check with only the env check able to say anything
  : > "$ALERT_LOG"; : > "$SEND_LOG"; : > "$CHOWN_LOG"
  # Pin the other checks to their quiet state. An earlier section leaves
  # host_mem at `bad`, and its RECOVERED would otherwise be counted here as a
  # second message from the env check — the same trap the disk band already
  # documents above.
  printf '%s' ok > "$TMP/state/host_mem"; printf '%s' ok > "$TMP/state/host_disk"
  # Likewise the failed-unit keys: section 1b leaves z.service at `bad`, and an
  # empty FAILED_UNITS here would emit its RECOVERED into this section's count.
  rm -f "$TMP"/state/host_unit_*
  APPROOT="$TMP/opt" APP_UNITS="demo-app.service" UNIT_USER="$(id -un)" \
    DISK_PCT=82 bash "$TMP/host-check.sh" >/dev/null 2>&1 || true
}

printf 'SECRET=1\n' > "$TMP/opt/demo/shared/.env"; chmod 000 "$TMP/opt/demo/shared/.env"
env_run
check "env: an unreadable .env is repaired, not merely reported" \
  "$([ -r "$TMP/opt/demo/shared/.env" ] && echo 0 || echo 1)"
check "env: the repair targets the unit's own User=, not a backup's owner" \
  "$(grep -q "$(id -un):$(id -un) $TMP/opt/demo/shared/.env" "$CHOWN_LOG" && echo 0 || echo 1)"
check "env: exactly one message, and it says it is already fixed (got $(sent))" \
  "$([ "$(sent)" -eq 1 ] && grep -q 'FIXED (no action needed)' "$SEND_LOG" && echo 0 || echo 1)"

# Healthy is silent — the repair must not become its own recurring alert.
env_run
check "env: a healthy .env says nothing at all (got $(sent))" \
  "$([ "$(sent)" -eq 0 ] && echo 0 || echo 1)"

# A recurrence AFTER a healthy pass reports again: the healthy path clears the
# stamp, so a second corruption is not swallowed by the first repair's cooldown.
chmod 000 "$TMP/opt/demo/shared/.env"
env_run
check "env: a fresh recurrence is reported again, not muted by the last repair" \
  "$([ "$(sent)" -eq 1 ] && echo 0 || echo 1)"

# When the repair CANNOT be made, it becomes a question — asked once, with the
# exact command in it, because that is the only case a human is needed for.
chmod 000 "$TMP/opt/demo/shared/.env"
: > "$ALERT_LOG"; : > "$SEND_LOG"; : > "$CHOWN_LOG"
printf '%s' ok > "$TMP/state/host_mem"; printf '%s' ok > "$TMP/state/host_disk"
rm -f "$TMP"/state/host_unit_*
rm -f "$TMP"/state/paged_envfix_demo "$TMP"/state/paged_envbad_demo
CHOWN_FAIL=1 APPROOT="$TMP/opt" APP_UNITS="demo-app.service" UNIT_USER="$(id -un)" \
  DISK_PCT=82 bash "$TMP/host-check.sh" >/dev/null 2>&1 || true
check "env: an unrepairable .env asks, and carries the exact fix command" \
  "$([ "$(sent)" -eq 1 ] && grep -q 'chown .* && systemctl restart demo-app.service' "$SEND_LOG" && echo 0 || echo 1)"
chmod 600 "$TMP/opt/demo/shared/.env"

printf '\n  %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
