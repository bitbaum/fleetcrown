#!/usr/bin/env bash
# Make `git push` deploy — push-to-deploy on our own box.
#
# Installs a pre-push hook into every repo in apps.conf (plus fleetcrown
# itself) that backgrounds the existing deploy pipeline (build standalone →
# rsync → restart → health check). The hook detaches and waits a few seconds
# so the actual push isn't slowed; the deploy builds the working tree you
# just pushed from. Logs land in /tmp/push-deploy-<app>.log.
#
# Idempotent: re-running updates the hook block in place (markers).
# Husky repos get the line in .husky/pre-push; plain repos in .git/hooks.
#
# Usage: install-push-deploy.sh [app ...]   (no args = all + fleetcrown)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MARK_BEGIN="# >>> fleetcrown push-deploy >>>"
MARK_END="# <<< fleetcrown push-deploy <<<"

install_hook() { # repo_path deploy_cmd app_name
  local repo="$1" deploy_cmd="$2" app="$3"
  local hook
  if [ -d "$repo/.husky" ]; then
    hook="$repo/.husky/pre-push"
    [ -f "$hook" ] || { echo "#!/usr/bin/env sh" > "$hook"; chmod +x "$hook"; }
  else
    [ -d "$repo/.git" ] || { echo "skip $app: no .git in $repo"; return; }
    hook="$repo/.git/hooks/pre-push"
    [ -f "$hook" ] || { echo "#!/usr/bin/env sh" > "$hook"; chmod +x "$hook"; }
  fi

  # Replace any previous block, then append the current one.
  local tmp
  tmp=$(mktemp)
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
    $0 == b { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip { print }
  ' "$hook" > "$tmp" && mv "$tmp" "$hook"

  cat >> "$hook" <<EOF
$MARK_BEGIN
# Pushing the repo's default branch deploys to the Hetzner box
# (background; see /tmp/push-deploy-$app.log). Repos differ: some use
# 'main', some still use 'master' — match either so push-to-deploy fires
# regardless of the repo's branch convention.
if git symbolic-ref --short HEAD 2>/dev/null | grep -qxE 'main|master'; then
  ( sleep 5 && $deploy_cmd ) >> /tmp/push-deploy-$app.log 2>&1 & disown 2>/dev/null || true
  echo "[push-deploy] $app: deploy started in background → /tmp/push-deploy-$app.log"
fi
$MARK_END
EOF
  chmod +x "$hook"
  echo "installed: $app ($hook)"
}

apps=("$@")
if [ ${#apps[@]} -eq 0 ]; then
  mapfile -t apps < <(app_names)
  apps+=(fleetcrown revampit)
fi

for app in "${apps[@]}"; do
  if [ "$app" = "fleetcrown" ]; then
    install_hook /home/g/dev/fleetcrown \
      "env -u CI bash /home/g/dev/fleetcrown/scripts/deploy-hetzner.sh" \
      fleetcrown
    continue
  fi
  if [ "$app" = "revampit" ]; then
    install_hook /home/g/dev/revampit \
      "env -u CI bash /home/g/dev/revampit/scripts/selfhost-deploy-revampit.sh" \
      revampit
    continue
  fi
  app_lookup "$app" || continue
  install_hook "$REPO" \
    "env -u CI bash $HERE/deploy.sh $NAME" \
    "$NAME"
done
