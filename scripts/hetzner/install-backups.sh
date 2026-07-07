#!/usr/bin/env bash
# install-backups.sh — box-wide Postgres backups for the bitbaum Hetzner box.
#
# WHY this is separate from install-hetzner-crons.sh: that script installs the
# FleetCrown *app* janitors (it calls fleetcrown's /api/crons/* endpoints).
# Backups protect EVERY database on the box (FleetCrown, OrangeCat, revampit +
# the 12 apps in apps.conf), so they're box-wide infra and live here next to
# sync-infra.sh / verify.sh.
#
# What it installs on the box (167.233.22.31):
#   /opt/backups/pg-backup.sh            nightly dump-all-databases runner
#   /etc/systemd/system/pg-backup.{service,timer}   runs daily at 02:30 UTC
#   restic (apt)                         for the optional off-box push
#
# Two-phase by design:
#   Phase 1 (active immediately): every DB dumped to /opt/backups/pg with
#     KEEP_DAYS retention. Strictly better than today's zero — but it's the
#     SAME DISK, so it does NOT survive disk loss.
#   Phase 2 (off-box, opt-in): drop /opt/backups/restic.env on the box and the
#     runner pushes encrypted snapshots to a Hetzner Storage Box. See the
#     instructions printed at the end of this run.
#
# Idempotent — safe to re-run after a box rebuild or schedule change.
# Usage: bash scripts/hetzner/install-backups.sh

set -euo pipefail

HOST="root@${HETZNER_IP:-167.233.22.31}"

ssh -o BatchMode=yes "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
export LC_ALL=C

mkdir -p /opt/backups/pg
chmod 700 /opt/backups

# restic for the optional off-box push (Phase 2). Cheap to have ready.
if ! command -v restic >/dev/null 2>&1; then
  echo "→ installing restic..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq restic >/dev/null && \
  echo "  restic installed" || echo "  WARN: restic install failed (Phase 1 still works)"
fi

# ── The backup runner ────────────────────────────────────────────────────────
cat > /opt/backups/pg-backup.sh <<'SH'
#!/usr/bin/env bash
# Box-wide Postgres backup. Installed by scripts/hetzner/install-backups.sh.
# Dumps every non-template DB (custom format) + global roles to /opt/backups/pg,
# prunes local copies older than KEEP_DAYS, and — only if /opt/backups/restic.env
# exists — pushes encrypted snapshots off-box via restic.
set -uo pipefail
export LC_ALL=C
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST=/opt/backups/pg
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DEST"
log(){ echo "[pg-backup $STAMP] $*"; }

# Roles, grants, tablespaces — required for a from-scratch restore.
sudo -u postgres pg_dumpall --globals-only 2>/dev/null | gzip > "$DEST/globals-$STAMP.sql.gz"

mapfile -t DBS < <(sudo -u postgres psql -At -c \
  "SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres'" 2>/dev/null)
log "dumping ${#DBS[@]} databases"
fail=0
for db in "${DBS[@]}"; do
  [ -z "$db" ] && continue
  if sudo -u postgres pg_dump -Fc "$db" > "$DEST/${db}-$STAMP.dump" 2>/dev/null; then
    log "ok $db ($(du -h "$DEST/${db}-$STAMP.dump" | cut -f1))"
  else
    log "FAIL $db"; rm -f "$DEST/${db}-$STAMP.dump"; fail=1
  fi
done

# Local retention (same disk — Phase 1 safety net only).
find "$DEST" -type f \( -name '*.dump' -o -name '*.sql.gz' \) -mtime "+$KEEP_DAYS" -delete

# Off-box push (Phase 2 — only when configured).
if [ -f /opt/backups/restic.env ]; then
  set -a; . /opt/backups/restic.env; set +a
  if restic snapshots >/dev/null 2>&1 || restic init >/dev/null 2>&1; then
    if restic backup "$DEST" --tag pg --host bitbaum >/dev/null 2>&1; then
      log "restic push ok → $RESTIC_REPOSITORY"
      restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune >/dev/null 2>&1 || true
    else
      log "ERROR: restic push failed — local dump kept"; fail=1
    fi
  else
    log "ERROR: restic repo unreachable — local dump kept, off-box skipped"; fail=1
  fi
else
  log "no /opt/backups/restic.env — LOCAL-ONLY backup (does NOT survive disk loss)"
fi
log "done: $(ls -1 "$DEST"/*-"$STAMP".* 2>/dev/null | wc -l) files; fail=$fail"
exit $fail
SH
chmod +x /opt/backups/pg-backup.sh

# ── systemd timer (daily 02:30 UTC) ──────────────────────────────────────────
cat > /etc/systemd/system/pg-backup.service <<'SVC'
[Unit]
Description=Box-wide Postgres backup (all databases)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/backups/pg-backup.sh
SVC

cat > /etc/systemd/system/pg-backup.timer <<'TIMER'
[Unit]
Description=Daily Postgres backup timer

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=300
Persistent=true
Unit=pg-backup.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now pg-backup.timer >/dev/null 2>&1
echo "✓ pg-backup.timer installed:"
systemctl list-timers pg-backup.timer --all --no-pager | grep -E 'pg-backup|NEXT' || true

# First run now so we have a backup tonight even if the box reboots before 02:30,
# and so we prove the path works end-to-end.
echo "→ running first backup now..."
/opt/backups/pg-backup.sh || echo "  (see output above)"
echo "--- /opt/backups/pg ---"
ls -lh /opt/backups/pg | tail -n +2
REMOTE

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
Phase 1 is LIVE: nightly dump of every database to /opt/backups/pg (02:30 UTC).
But that's the same disk — to survive disk loss, enable off-box (Phase 2):

1. Hetzner Console (https://console.hetzner.cloud) → Storage Boxes → create a
   BX11 box (~CHF 4/mo, 1 TB). Note its username (uXXXXXX) and host
   (uXXXXXX.your-storagebox.de).
2. Enable SSH on the Storage Box: Storage Box → Settings → "SSH support" ON.
3. Put root's key on it (one line, run locally):
     ssh-copy-id -p23 uXXXXXX@uXXXXXX.your-storagebox.de
   (or paste root@bitbaum's ~/.ssh/id_*.pub into the Storage Box → SSH keys UI)
4. On the box, create the config (replace uXXXXXX + pick a strong password,
   and SAVE the password somewhere safe — losing it means losing the backups):
     ssh root@167.233.22.31
     cat > /opt/backups/restic.env <<EOF
     export RESTIC_REPOSITORY="sftp:uXXXXXX@uXXXXXX.your-storagebox.de:/pg"
     export RESTIC_PASSWORD="<a-strong-passphrase>"
     EOF
     chmod 600 /opt/backups/restic.env
5. Prove it:  /opt/backups/pg-backup.sh   # should print "restic push ok"

Restore drill (do this once so you trust it):
     restic -r "$RESTIC_REPOSITORY" snapshots
     restic -r "$RESTIC_REPOSITORY" restore latest --target /tmp/restore
     sudo -u postgres pg_restore -d <db> --clean /tmp/restore/opt/backups/pg/<db>-*.dump
────────────────────────────────────────────────────────────────────────────
NEXT
