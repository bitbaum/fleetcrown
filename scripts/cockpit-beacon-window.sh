#!/usr/bin/env bash
# cockpit-beacon-window.sh — keep a chromium --app= window open on /beacon/live.
#
# Run by the cockpit-beacon-window.service systemd user unit. Restart=always
# means systemd brings the window back within ~2s whenever it dies, so a stop
# hook always finds a pre-warmed window to focus (PyQt-equivalent <100ms).
#
# Why a dedicated browser profile: the window needs to survive independently
# of the user's main browser session. A separate --user-data-dir keeps cookies,
# zoom level, and window position isolated from regular browsing.

set -euo pipefail

URL="${COCKPIT_BEACON_URL:-http://localhost:3000/beacon/live}"
PROFILE_DIR="${COCKPIT_BEACON_PROFILE:-$HOME/.config/cockpit-beacon-profile}"

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
    echo "cockpit-app unreachable after 60s — exiting" >&2
    exit 1
  fi
  sleep 1
done

mkdir -p "$PROFILE_DIR"
mkdir -p "/tmp/cockpit-beacon"

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
    echo "$$" > "/tmp/cockpit-beacon/live-browser.pid"
    # Unset WAYLAND_DISPLAY + force --ozone-platform=x11: on KDE Plasma Wayland,
    #   chromium-family browsers default to native Wayland for --app windows
    #   (only the clipboard helper goes through XWayland). xdotool is X11-only,
    #   so a Wayland-native window is invisible to it and our show/hide endpoints
    #   silently no-op. Unsetting WAYLAND_DISPLAY routes everything through
    #   XWayland — xdotool can then find, move, and raise the window.
    env -u WAYLAND_DISPLAY "$browser" \
      --app="$URL" \
      --user-data-dir="$PROFILE_DIR" \
      --class=cockpit-beacon \
      --ozone-platform=x11 \
      --window-size=560,720 \
      --no-first-run \
      --no-default-browser-check &
    browser_pid=$!

    # Background watcher: as soon as the window appears, unmap it so the user
    # never sees an empty "Standby" flash. The React useEffect then drives
    # show/hide based on session state. We poll for up to ~10s.
    (
      for _ in $(seq 1 20); do
        if command -v xdotool >/dev/null 2>&1; then
          wids=$(xdotool search --class cockpit-beacon 2>/dev/null) || wids=""
          if [ -n "$wids" ]; then
            echo "$wids" | xargs -n1 xdotool windowunmap 2>/dev/null || true
            exit 0
          fi
        fi
        sleep 0.5
      done
    ) &

    wait "$browser_pid"
    exit $?
  fi
done

echo "no chromium-family browser found (tried: chromium, chromium-browser, brave-browser, google-chrome)" >&2
exit 1
