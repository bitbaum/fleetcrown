#!/usr/bin/env python3
"""
Beacon — desktop launcher for the web popup.

When an agent session stops the hook calls:

  beacon.py stop <project_label> [session_file]

beacon.py writes the session metadata to /tmp/cockpit-beacon/<id>.json (no API
auth required) and opens the Cockpit web popup at /beacon/live in a frameless
Chrome `--app` window. The popup polls the session file for the user's choice
and patches it back via the Cockpit API.

If Cockpit isn't reachable the launcher writes the session anyway (it'll
surface via SSE the moment Cockpit boots), fires the systemd user unit in
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

    The Cockpit beacon route reads sessions from /tmp/cockpit-beacon/{id}.json.
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


# ── Browser launcher ───────────────────────────────────────────────────────────

_LIVE_PID_FILE = os.path.join(_BEACON_DIR, "live-browser.pid")
_LIVE_URL = f"{COCKPIT_URL}/beacon/live"


def _focus_live_window() -> bool:
    """Bring the pre-warmed /beacon/live window to the foreground.

    Tries xdotool first (most reliable), then wmctrl as fallback.
    Returns True if a window was found and raised.
    """
    if shutil.which("xdotool"):
        result = subprocess.run(
            ["xdotool", "search", "--name", "beacon/live"],
            capture_output=True, text=True,
        )
        wids = result.stdout.strip().split()
        for wid in wids:
            subprocess.run(["xdotool", "windowactivate", "--sync", wid], capture_output=True)
            subprocess.run(["xdotool", "windowraise", wid], capture_output=True)
        if wids:
            return True
    if shutil.which("wmctrl"):
        result = subprocess.run(["wmctrl", "-l"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if "beacon/live" in line:
                wid = line.split()[0]
                subprocess.run(["wmctrl", "-ia", wid], capture_output=True)
                return True
    return False


def _open_browser_beacon() -> bool:
    """Ensure the /beacon/live pre-warmed window is open and visible.

    Priority order:
      1. Live PID file → check process alive → focus window.
      2. No PID (or stale) → try xdotool/wmctrl first; the cockpit-beacon-window
         systemd service manages its own process and never writes the PID file.
      3. No window found at all → cold-spawn a new browser tab.

    Returns True if a browser window is running, False if no browser was found.
    """
    # Case 1: beacon.py previously spawned a window (PID file exists).
    if os.path.exists(_LIVE_PID_FILE):
        try:
            pid = int(open(_LIVE_PID_FILE).read().strip())
            os.kill(pid, 0)  # raises if process is dead
            _focus_live_window()
            return True
        except (ProcessLookupError, ValueError, OSError):
            pass  # stale — fall through to cases 2/3

    # Case 2: service-managed window (no PID file). Try focus before spawning.
    if _focus_live_window():
        return True

    # Case 3: no window found — cold-start one.
    for b in ("chromium", "chromium-browser", "brave-browser", "google-chrome"):
        if shutil.which(b):
            try:
                proc = subprocess.Popen(
                    [b, f"--app={_LIVE_URL}"],
                    start_new_session=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                os.makedirs(_BEACON_DIR, exist_ok=True)
                with open(_LIVE_PID_FILE, "w") as f:
                    f.write(str(proc.pid))
                return True
            except (FileNotFoundError, OSError):
                continue
    return False


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


# ── Cockpit-not-running recovery ───────────────────────────────────────────────

def _start_cockpit_background() -> None:
    """Fire-and-forget start of the Cockpit systemd user unit. No polling, no
    blocking dialog. The session JSON has already been written to /tmp; once
    Cockpit boots, /api/beacon/sse picks it up on the next subscriber connect.
    """
    if shutil.which("systemctl"):
        subprocess.Popen(
            ["systemctl", "--user", "start", "cockpit-app"],
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
    # whenever Cockpit is up. If Cockpit is down, fire its systemd unit and exit;
    # the user's stop hook doesn't block on a foreign dialog, and the session is
    # still captured.
    session_id = _write_beacon_session(label, session_content, popup_mode)
    if not _cockpit_ready():
        _start_cockpit_background()
        sys.exit(1)

    if not _open_browser_beacon():
        # Browser unavailable — the Control panel ReadyBanner can still serve as
        # the interaction surface, so poll the session file anyway.
        choice = _poll_beacon_choice(session_id)
        if choice:
            print(choice)
            sys.exit(0)
        sys.exit(1)

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
