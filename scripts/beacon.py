#!/usr/bin/env python3
"""
Beacon — desktop launcher for the web popup.

When an agent session stops the hook calls:

  beacon.py stop <project_label> [session_file]

beacon.py writes the session metadata to /tmp/cockpit-beacon/<id>.json (no API
auth required) and opens the FleetCrown web popup at /beacon/live in a frameless
Chrome `--app` window. The popup polls the session file for the user's choice
and patches it back via the FleetCrown API.

If FleetCrown isn't reachable the launcher writes the session anyway (it'll
surface via SSE the moment FleetCrown boots), fires the systemd user unit in
the background, and exits silently. No blocking dialog, no foreign UI —
design lives in src/components/control/* and the web popup is the single
source of truth.

Module layout:
  _beacon_config.py — runtime constants + settings/prompt-meta helpers
  beacon.py         — entry point (this file)
"""

import sys, os, subprocess, shutil, time, json as _json, uuid
import urllib.request

from _beacon_config import (
    COCKPIT_URL,
    load_settings,
    COUNTDOWN_SECONDS,
    read_project_git_branch,
    looks_like_capacity_issue,
    resolve_next_agent,
    get_popup_mode,
)


# ── Shared helpers ─────────────────────────────────────────────────────────────

_BEACON_DIR = "/tmp/cockpit-beacon"


def _cockpit_ready(timeout: float = 2.0) -> bool:
    try:
        r = urllib.request.urlopen(f"{COCKPIT_URL}/api/health", timeout=timeout)
        return r.status == 200
    except Exception:
        return False


def _current_agent() -> str:
    raw = os.environ.get("AGENT_CURRENT_AGENT", "").strip().lower()
    return raw if raw in ("claude", "codex", "gemini") else "claude"


def _check_capacity_sentinel(label: str) -> bool:
    """Return True if the notification hook wrote a capacity-issue sentinel < 5 min ago."""
    path = f"/tmp/agent-capacity-issue-{label}"
    if not os.path.exists(path):
        return False
    try:
        ts = int(open(path).read().strip())
        os.unlink(path)
        return (time.time() - ts) < 300
    except Exception:
        try:
            os.unlink(path)
        except Exception:
            pass
        return False


def _write_beacon_session(label: str, session_content: str, popup_mode: str = "web") -> str:
    """Write a beacon session file directly to /tmp — no API auth required.

    The FleetCrown beacon route reads sessions from /tmp/cockpit-beacon/{id}.json.
    Writing directly here means beacon.py never needs to authenticate with the
    web server; the browser popup reads/writes via the API using its session cookie.
    """
    session_id = str(uuid.uuid4())
    _s = load_settings()
    configured_countdown = int(_s.get("countdown_seconds", _s.get("countdown_secs", COUNTDOWN_SECONDS)))
    session = {
        "id": session_id,
        "project": label,
        "sessionContent": session_content,
        "createdAt": int(time.time() * 1000),
        "choice": None,
        "currentAgent": _current_agent(),
        "nextAgent": resolve_next_agent(_current_agent()),
        "capacityIssue": _check_capacity_sentinel(label) or looks_like_capacity_issue(session_content),
        "countdownSeconds": configured_countdown,
        "popupMode": popup_mode,
        "gitBranch": read_project_git_branch(label),
    }
    os.makedirs(_BEACON_DIR, exist_ok=True)
    # Cancel any active (no choice yet) sessions for this project so the new
    # session is the only pending one the SSE stream picks up.
    try:
        for fname in os.listdir(_BEACON_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(_BEACON_DIR, fname)
            try:
                existing = _json.loads(open(fpath).read())
                if existing.get("project") == label and existing.get("choice") is None:
                    os.remove(fpath)
            except Exception:
                pass
    except Exception:
        pass
    with open(os.path.join(_BEACON_DIR, f"{session_id}.json"), "w") as f:
        _json.dump(session, f)
    return session_id


def _read_beacon_choice_fs(session_id: str) -> str | None:
    try:
        data = _json.loads(open(os.path.join(_BEACON_DIR, f"{session_id}.json")).read())
        return data.get("choice")
    except Exception:
        return None


# ── Browser window ─────────────────────────────────────────────────────────────
#
# The fleetcrown-beacon-window.service systemd user unit owns the pre-warmed
# brave/chromium --app window. beacon.py does NOT spawn its own — that path
# created rogue, untargetable windows whenever the unit wasn't running.
#
# Window show/hide is driven by React's useEffect on /beacon/live, which posts
# to /api/beacon/window/{show,hide}. beacon.py just writes the session JSON
# (SSE picks it up) and ensures the systemd unit is running.


def _ensure_beacon_window_unit() -> None:
    """Make sure fleetcrown-beacon-window.service is running. Idempotent and fast
    (systemctl start on an already-active unit is a no-op). Tries the canonical
    fleetcrown-beacon-window first and the legacy cockpit-beacon-window second so
    transitional installs that still have the old unit name keep working.
    """
    if shutil.which("systemctl"):
        subprocess.Popen(
            ["systemctl", "--user", "start", "fleetcrown-beacon-window", "cockpit-beacon-window"],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _raise_beacon_window() -> None:
    """Tell the show endpoint to bring the pre-warmed window forward.
    Fires asynchronously — SSE delivery will trigger the same path from the
    React side, so this is belt-and-suspenders to minimise perceived latency.
    """
    try:
        req = urllib.request.Request(
            f"{COCKPIT_URL}/api/beacon/window/show",
            method="POST",
            headers={"Content-Length": "0"},
        )
        urllib.request.urlopen(req, timeout=1.0).close()
    except Exception:
        pass


def _poll_beacon_choice(session_id: str, timeout: float = 130.0) -> str | None:
    """Block until the beacon session records a user choice or timeout elapses.

    Reads the session JSON directly — no HTTP round trip, no auth needed.
    The Claude Code stop hook has a 150s timeout; 130s gives margin before
    it hard-kills the process.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        choice = _read_beacon_choice_fs(session_id)
        if choice is not None:
            return choice
        time.sleep(0.5)
    return None


# ── FleetCrown-not-running recovery ───────────────────────────────────────────────

def _start_cockpit_background() -> None:
    """Fire-and-forget start of the FleetCrown systemd user unit. No polling, no
    blocking dialog. The session JSON has already been written to /tmp; once
    FleetCrown boots, /api/beacon/sse picks it up on the next subscriber connect.
    """
    if shutil.which("systemctl"):
        # Try canonical fleetcrown-app first; fall back to legacy cockpit-app for
        # transitional installs. systemctl start is a no-op if the unit is already
        # running, so the duplicate call is safe.
        subprocess.Popen(
            ["systemctl", "--user", "start", "fleetcrown-app", "cockpit-app"],
            start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )


# ── Stop handler ───────────────────────────────────────────────────────────────

def _stop(label: str, session_file: str) -> None:
    """Open the web popup for an agent session that just ended.

    popup_mode controls whether to show anything at all:
      web | both  — open browser popup (both is treated as web — pyqt was retired)
      pyqt        — coerced to web at the config layer (deprecated)
      disabled    — exit immediately, no popup fires
    """
    popup_mode = get_popup_mode()
    if popup_mode == "disabled":
        sys.exit(1)

    session_content = ""
    if session_file and os.path.exists(session_file):
        try:
            session_content = open(session_file).read().strip()
        except OSError:
            pass

    # Write the session unconditionally — it lands in /tmp and surfaces via SSE
    # whenever FleetCrown is up. If FleetCrown is down, fire its systemd unit and exit;
    # the user's stop hook doesn't block on a foreign dialog, and the session is
    # still captured.
    session_id = _write_beacon_session(label, session_content, popup_mode)
    if not _cockpit_ready():
        _start_cockpit_background()
        sys.exit(1)

    # Ensure the pre-warmed window unit is running (idempotent), then ping the
    # show endpoint optimistically — SSE will trigger the same path from React
    # but this minimises perceived latency.
    _ensure_beacon_window_unit()
    _raise_beacon_window()

    choice = _poll_beacon_choice(session_id)
    if choice:
        print(choice)
        sys.exit(0)
    sys.exit(1)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(1)
    os.environ.setdefault("DISPLAY", ":0")

    mode = sys.argv[1]
    if mode in ("stop", "pyqt-stop"):  # pyqt-stop kept as alias for back-compat
        label = sys.argv[2]
        sf = sys.argv[3] if len(sys.argv) > 3 else ""
        _stop(label, sf)
    else:
        # `confirm` was the destructive-command Allow/Deny dialog and is no
        # longer wired into any hook. Exit cleanly so callers don't break.
        sys.exit(1)


if __name__ == "__main__":
    main()
