#!/usr/bin/env bash
# fleetcrown-beacon-window.sh — keep a chromium --app= window open on /beacon/live.
#
# ⚠️  DEPRECATED as of 2026-06-11 (Session 1 of killing-the-bash-daemon plan).
#     The fleetcrown-beacon-window.service systemd unit is now masked
#     (/dev/null symlink in ~/.config/systemd/user/) and the original unit
#     file is preserved at ~/.config/systemd/user/fleetcrown-beacon-window
#     .service.disabled-2026-06-11. This script is kept in git history
#     only — it will be deleted in Session 4 along with the rest of the
#     bash bridge. See /home/g/.claude/plans/structured-baking-kazoo.md
#     and content/thoughts/killing-the-bash-daemon.md for context.
#     The L3 "beacon popup" mode that this window served is being collapsed
#     into a simpler ON/OFF model; Fleet Runner desktop is the sole local
#     executor going forward.
#
# Original purpose (for historical reference):
# Run by the fleetcrown-beacon-window.service systemd user unit. Restart=always
# means systemd brings the window back within ~2s whenever it dies, so a stop
# hook always finds a pre-warmed window to focus (PyQt-equivalent <100ms).
#
# Why a dedicated browser profile: the window needs to survive independently
# of the user's main browser session. A separate --user-data-dir keeps cookies,
# zoom level, and window position isolated from regular browsing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_brand.sh
source "$SCRIPT_DIR/_brand.sh"

# WM_CLASS for this window. Contract between this script, /api/beacon/window/show,
# and /api/beacon/window/hide — all three must agree or the show/hide endpoints
# can't find the window via xdotool. Derived from APP_SLUG so a rename flips
# all three together.
BEACON_WM_CLASS="${APP_SLUG}-beacon"

URL="$(_brand_env BEACON_URL "http://localhost:3000/beacon/live")"
PROFILE_DIR="$(_brand_env BEACON_PROFILE "$HOME/.config/${APP_SLUG}-beacon-profile")"

# No graphical session → exit cleanly. Systemd will retry per Restart=always;
# the sleep avoids a tight restart loop during boot before X/Wayland comes up.
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  sleep 15
  exit 0
fi

# Wait for cockpit-app to start serving before pointing chromium at the URL,
# otherwise the first paint is a "site can't be reached" page that stays cached.
HEALTH="${URL%/beacon/live}/api/health"
deadline=$((SECONDS + 60))
until curl -sf -m 1 "$HEALTH" >/dev/null 2>&1; do
  if [ "$SECONDS" -gt "$deadline" ]; then
    echo "${APP_SLUG}-app unreachable after 60s — exiting" >&2
    exit 1
  fi
  sleep 1
done

mkdir -p "$PROFILE_DIR"
mkdir -p "$(_brand_tmp 'beacon')"

# --class=cockpit-beacon: lets /api/beacon/window/{show,hide} target this window
#   specifically via xdotool, so a user's regular browser tab at the same URL is
#   never accidentally moved.
# --window-position=-32000,-32000: spawn off-screen. The page loads, SSE connects,
#   BeaconLiveClient mounts — all invisible. When a session arrives the React
#   useEffect POSTs /api/beacon/window/show and xdotool moves the window
#   on-screen fully populated. No "Standby" flash, ever.
for browser in chromium chromium-browser brave-browser google-chrome; do
  if command -v "$browser" >/dev/null 2>&1; then
    # Write PID file so beacon.py can focus this window without xdotool on every call.
    echo "$$" > "$(_brand_tmp 'beacon')/live-browser.pid"
    # Unset WAYLAND_DISPLAY + force --ozone-platform=x11: on KDE Plasma Wayland,
    #   chromium-family browsers default to native Wayland for --app windows
    #   (only the clipboard helper goes through XWayland). xdotool is X11-only,
    #   so a Wayland-native window is invisible to it and our show/hide endpoints
    #   silently no-op. Unsetting WAYLAND_DISPLAY routes everything through
    #   XWayland — xdotool can then find, move, and raise the window.
    env -u WAYLAND_DISPLAY "$browser" \
      --app="$URL" \
      --user-data-dir="$PROFILE_DIR" \
      --class="$BEACON_WM_CLASS" \
      --ozone-platform=x11 \
      --window-size=560,720 \
      --no-first-run \
      --no-default-browser-check &
    browser_pid=$!

    # Background watcher: as soon as the window appears, unmap it so the user
    # never sees an empty "Standby" flash. `xdotool search --sync` blocks until
    # at least one matching window exists (no fixed timeout — on slow systems
    # brave can take 10+ seconds to create the window). Once unmapped, the
    # React useEffect on /beacon/live drives show/hide based on session state.
    if command -v xdotool >/dev/null 2>&1; then
      (
        # --sync waits for first match; --onlyvisible filters to mapped windows
        # (the unmapped window won't be re-found on a second --sync call).
        wids=$(xdotool search --sync --onlyvisible --class "$BEACON_WM_CLASS" 2>/dev/null) || wids=""
        for wid in $wids; do
          xdotool windowunmap "$wid" 2>/dev/null || true
        done
      ) &
    fi

    wait "$browser_pid"
    exit $?
  fi
done

echo "no chromium-family browser found (tried: chromium, chromium-browser, brave-browser, google-chrome)" >&2
exit 1
