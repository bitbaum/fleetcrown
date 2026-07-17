#!/usr/bin/env bash
# Roll an app back to its previous release (or a named one) — the escape hatch
# the releases layout in deploy.sh exists for. Flips the /opt/<name>/app
# symlink atomically, restarts, health-checks. Never deletes anything.
#
# Usage: rollback.sh <app> [release-name]
#   rollback.sh vitareba              → previous release (newest that isn't current)
#   rollback.sh vitareba 20260717-...  → that specific release
#   rollback.sh vitareba --list       → show releases + current
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

app_lookup "${1:?usage: rollback.sh <app> [release|--list]}"
TARGET="${2:-}"

CUR=$(box "readlink /opt/$NAME/app 2>/dev/null || true")
[ -n "$CUR" ] || { echo "ERROR: /opt/$NAME/app is not a release symlink — nothing to roll back (pre-releases layout?)"; exit 1; }

if [ "$TARGET" = "--list" ]; then
  echo "current: $CUR"
  box "cd /opt/$NAME/releases && ls -1t"
  exit 0
fi

if [ -z "$TARGET" ]; then
  # newest release that isn't the current one
  TARGET=$(box "cd /opt/$NAME/releases && ls -1t" | while read -r r; do
    [ "/opt/$NAME/releases/$r" != "$CUR" ] && { echo "$r"; break; }
  done)
  [ -n "$TARGET" ] || { echo "ERROR: no previous release to roll back to"; exit 1; }
fi

DEST="/opt/$NAME/releases/$TARGET"
box "test -d '$DEST'" || { echo "ERROR: $DEST does not exist"; exit 1; }

echo "rolling back $NAME: $CUR → $DEST"
box "ln -sfn '$DEST' /opt/$NAME/app.new && mv -T /opt/$NAME/app.new /opt/$NAME/app && sudo systemctl restart $NAME-app"
status=inactive; code=000
for _ in $(seq 1 15); do
  sleep 4
  status=$(box "systemctl is-active $NAME-app 2>/dev/null" || true)
  code=$(box "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:$PORT/ 2>/dev/null" || true)
  code="${code:-000}"
  [ "$status" = "active" ] && [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 400 ] && break
  [ "$status" = "failed" ] && break
done
echo "RESULT $NAME: systemd=$status http=$code now-serving=$TARGET"
[ "$status" = "active" ] && [ "$code" -ge 200 ] && [ "$code" -lt 400 ]
