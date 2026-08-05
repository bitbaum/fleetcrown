#!/usr/bin/env bash
# Tests for the box disk garbage collector. Runs anywhere — no box needed.
#
# The `df` stub computes usage from the ACTUAL size of a temp tree, so a
# deletion genuinely moves the reported percentage. That means the tests
# exercise the real stop-when-under-target control flow rather than a scripted
# sequence of fake readings.
#
# Usage: scripts/hetzner/test-disk-gc.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC="$HERE/install-disk-gc.sh"
ALERTSRC="$HERE/install-host-alerts.sh"
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/state" "$TMP/bin" "$TMP/fs/dev" "$TMP/fs/opt"

# Extract the shipped payloads — the code under test is the code that ships.
sed -n "/<<'GC'\$/,/^GC\$/p"   "$SRC"      | sed '1d;$d' > "$TMP/disk-gc.sh"
sed -n "/<<'LIB'\$/,/^LIB\$/p" "$ALERTSRC" | sed '1d;$d' > "$TMP/lib-alert.sh"
[ -s "$TMP/disk-gc.sh" ]   || { echo "FAIL: could not extract disk-gc.sh"; exit 1; }
[ -s "$TMP/lib-alert.sh" ] || { echo "FAIL: could not extract lib-alert.sh"; exit 1; }
chmod +x "$TMP/disk-gc.sh"

FAKE_FS="$TMP/fs"
FAKE_TOTAL_MB=200

# df stub: usage derived from the real tree, so rm actually lowers the number.
cat > "$TMP/bin/df" <<STUB
#!/usr/bin/env bash
used_mb=\$(du -sm "$FAKE_FS" 2>/dev/null | cut -f1)
used_mb=\${used_mb:-0}
pct=\$(( used_mb * 100 / $FAKE_TOTAL_MB ))
case "\$*" in
  *pcent*) printf 'Use%%\n%s%%\n' "\$pct" ;;
  *used*)  printf 'Used\n%s\n' "\$(( used_mb * 1024 ))" ;;
esac
STUB
cat > "$TMP/bin/logger" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${*: -1}" >> "$ALERT_LOG"
STUB
# Tier 1/2 tools free nothing here — keeps the test focused on tiers 3 and 4.
for t in journalctl apt-get npm sudo id; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/$t"
done
chmod +x "$TMP/bin"/*
export PATH="$TMP/bin:$PATH"
export MON="$TMP"
export ALERT_LOG="$TMP/alerts.log"

pass=0 fail=0
check() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ✓ %s\n' "$1"
          else fail=$((fail+1)); printf '  ✗ %s\n' "$1"; fi; }

# Build a fresh fake filesystem for each scenario.
seed() {
  rm -rf "$FAKE_FS"; mkdir -p "$FAKE_FS/dev" "$FAKE_FS/opt"
  : > "$ALERT_LOG"; rm -f "$TMP/state/host_diskgc"
  local old_ts="202601010000"   # long past → cold
  # Two cold repos and one worked-on-today repo, each with a 20MB node_modules.
  for r in coldrepo olderrepo; do
    mkdir -p "$FAKE_FS/dev/$r/src" "$FAKE_FS/dev/$r/node_modules"
    dd if=/dev/zero of="$FAKE_FS/dev/$r/node_modules/blob" bs=1M count=20 2>/dev/null
    echo "x" > "$FAKE_FS/dev/$r/src/index.ts"
    touch -t "$old_ts" "$FAKE_FS/dev/$r/src/index.ts"
  done
  mkdir -p "$FAKE_FS/dev/hotrepo/src" "$FAKE_FS/dev/hotrepo/node_modules"
  dd if=/dev/zero of="$FAKE_FS/dev/hotrepo/node_modules/blob" bs=1M count=20 2>/dev/null
  echo "x" > "$FAKE_FS/dev/hotrepo/src/index.ts"   # touched now → hot
  # Four releases for one app; only the newest two may survive.
  mkdir -p "$FAKE_FS/opt/someapp/releases"
  for i in 1 2 3 4; do
    mkdir -p "$FAKE_FS/opt/someapp/releases/rel-$i"
    dd if=/dev/zero of="$FAKE_FS/opt/someapp/releases/rel-$i/blob" bs=1M count=10 2>/dev/null
    touch -d "2026-01-0$i" "$FAKE_FS/opt/someapp/releases/rel-$i"
  done
}

gc() { # extra env assignments
  env DISK_GC_DEV_ROOT="$FAKE_FS/dev" DISK_GC_OPT_ROOT="$FAKE_FS/opt" \
      DISK_GC_IDLE_DAYS=14 DISK_GC_KEEP_RELEASES=2 DISK_GC_NO_LOCK=1 "$@" \
      bash "$TMP/disk-gc.sh" >/dev/null 2>&1 || true
}

echo "disk-gc tests"

# ── 1. Below the high-water mark it must do NOTHING ──────────────────────────
seed
# 100MB used of 200MB = 50%, below HIGH_PCT
gc DISK_GC_HIGH_PCT=75 DISK_GC_TARGET_PCT=65
check "below high-water: cold node_modules untouched" \
  "$([ -d "$FAKE_FS/dev/coldrepo/node_modules" ] && echo 0 || echo 1)"
check "below high-water: old releases untouched" \
  "$([ -d "$FAKE_FS/opt/someapp/releases/rel-1" ] && echo 0 || echo 1)"
check "below high-water: sends no alert" \
  "$([ ! -s "$ALERT_LOG" ] || ! grep -q 'DISK GC' "$ALERT_LOG" && echo 0 || echo 1)"

# ── 2. Under pressure: reclaim cold things, protect hot ones ─────────────────
seed
# Force pressure by setting the marks below current usage (50%).
gc DISK_GC_HIGH_PCT=20 DISK_GC_TARGET_PCT=1
check "under pressure: cold repo node_modules reclaimed" \
  "$([ ! -d "$FAKE_FS/dev/coldrepo/node_modules" ] && echo 0 || echo 1)"
check "under pressure: second cold repo reclaimed too" \
  "$([ ! -d "$FAKE_FS/dev/olderrepo/node_modules" ] && echo 0 || echo 1)"
check "HOT repo (touched today) is PROTECTED" \
  "$([ -d "$FAKE_FS/dev/hotrepo/node_modules" ] && echo 0 || echo 1)"
check "cold repo's source tree is left intact (only node_modules goes)" \
  "$([ -f "$FAKE_FS/dev/coldrepo/src/index.ts" ] && echo 0 || echo 1)"
check "releases beyond keep-count removed" \
  "$([ ! -d "$FAKE_FS/opt/someapp/releases/rel-1" ] && echo 0 || echo 1)"
check "newest 2 releases kept" \
  "$([ -d "$FAKE_FS/opt/someapp/releases/rel-4" ] && [ -d "$FAKE_FS/opt/someapp/releases/rel-3" ] && echo 0 || echo 1)"
check "reports what it freed" \
  "$(grep -q 'DISK GC: freed' "$ALERT_LOG" && echo 0 || echo 1)"

# ── 3. Stops at the cheapest tier that suffices (does not over-delete) ──────
# Usage is 50%, target 45%. Dropping two 10MB releases gets there, so the GC
# must stop BEFORE tier 4 and leave every node_modules alone. This is the
# property that makes the GC safe to run hourly: it takes the cheapest thing
# that works, never the most.
seed
gc DISK_GC_HIGH_PCT=45 DISK_GC_TARGET_PCT=45
remaining=$(ls -1d "$FAKE_FS"/dev/*/node_modules 2>/dev/null | wc -l)
rels=$(ls -1d "$FAKE_FS"/opt/someapp/releases/* 2>/dev/null | wc -l)
check "cheap tier sufficed: all 3 node_modules survive (got $remaining)" \
  "$([ "$remaining" -eq 3 ] && echo 0 || echo 1)"
check "cheap tier actually ran: releases trimmed to 2 (got $rels)" \
  "$([ "$rels" -eq 2 ] && echo 0 || echo 1)"

# ── 4. Nothing reclaimable while still over the mark must ESCALATE ───────────
# No dev root, no releases → every tier is a no-op, but the disk is still full.
rm -rf "$FAKE_FS"; mkdir -p "$FAKE_FS/dev" "$FAKE_FS/opt"
dd if=/dev/zero of="$FAKE_FS/ballast" bs=1M count=180 2>/dev/null
: > "$ALERT_LOG"; rm -f "$TMP/state/host_diskgc"
gc DISK_GC_HIGH_PCT=75 DISK_GC_TARGET_PCT=65
check "exhausted tiers while still full: escalates, not silent" \
  "$(grep -q 'could not free space' "$ALERT_LOG" && echo 0 || echo 1)"

# ── 5. safe_rm refuses to delete outside the root it was given ───────────────
mkdir -p "$TMP/outside/precious"
# `|| true`: safe_rm returning 1 IS the refusal we are asserting, and this file
# runs under `set -e`.
( MON="$TMP" . "$TMP/lib-alert.sh"
  DRY_RUN=0
  # shellcheck disable=SC1090
  eval "$(sed -n '/^safe_rm()/,/^}/p' "$TMP/disk-gc.sh")"
  safe_rm "$TMP/outside/precious" "$FAKE_FS" ) >/dev/null 2>&1 || true
check "safe_rm refuses a path outside its allowed prefix" \
  "$([ -d "$TMP/outside/precious" ] && echo 0 || echo 1)"

# ── 6. Two passes must not run concurrently ─────────────────────────────────
# Observed for real on install: the timer's catch-up run overlapped the initial
# run and both tried to remove the same node_modules. With the flock in place
# the second pass must bail out instead of racing.
if command -v flock >/dev/null 2>&1; then
  seed
  # Hold the lock from OUTSIDE for a fixed window, so the assertion does not
  # depend on two processes happening to overlap (that raced green locally and
  # only failed in CI). Inside the window a pass must skip cleanly.
  ( flock 9; sleep 3 ) 9>"$TMP/state/.disk-gc.lock" &
  holder=$!
  sleep 0.5
  set +e
  env DISK_GC_DEV_ROOT="$FAKE_FS/dev" DISK_GC_OPT_ROOT="$FAKE_FS/opt" \
      DISK_GC_IDLE_DAYS=14 DISK_GC_KEEP_RELEASES=2 \
      DISK_GC_HIGH_PCT=20 DISK_GC_TARGET_PCT=1 \
      bash "$TMP/disk-gc.sh" >"$TMP/second.log" 2>&1
  blocked_rc=$?
  set -e
  check "lock held: pass exits 0 (a busy lock is normal, not a failure) (rc=$blocked_rc)" \
    "$([ "$blocked_rc" -eq 0 ] && echo 0 || echo 1)"
  check "lock held: pass deleted nothing" \
    "$([ -d "$FAKE_FS/dev/coldrepo/node_modules" ] && echo 0 || echo 1)"
  wait "$holder" 2>/dev/null || true

  # Lock released → the very same command must now do its job.
  set +e
  env DISK_GC_DEV_ROOT="$FAKE_FS/dev" DISK_GC_OPT_ROOT="$FAKE_FS/opt" \
      DISK_GC_IDLE_DAYS=14 DISK_GC_KEEP_RELEASES=2 \
      DISK_GC_HIGH_PCT=20 DISK_GC_TARGET_PCT=1 \
      bash "$TMP/disk-gc.sh" >/dev/null 2>&1
  free_rc=$?
  set -e
  check "lock free: same pass runs and reclaims (rc=$free_rc)" \
    "$([ "$free_rc" -eq 0 ] && [ ! -d "$FAKE_FS/dev/coldrepo/node_modules" ] && echo 0 || echo 1)"
  check "lock free: hot repo still protected" \
    "$([ -d "$FAKE_FS/dev/hotrepo/node_modules" ] && echo 0 || echo 1)"
else
  echo "  - flock unavailable, skipping concurrency test"
fi

echo
echo "  ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
