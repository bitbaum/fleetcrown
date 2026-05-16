#!/usr/bin/env python3
"""
Beacon — Claude Code desktop overlay for session stops and tool confirms.

Usage:
  beacon.py stop    <project_label> [session_file]
  beacon.py confirm <tool_name> <cmd_file>

Module layout:
  _beacon_theme.py   — color palettes + theme loading (no PyQt)
  _beacon_config.py  — runtime constants + settings/prompt-meta helpers (no PyQt)
  _beacon_audio.py   — WhisperThread speech-to-text
  _beacon_popups.py  — Qt stylesheet, widget helpers, ContinuePopup, ConfirmPopup
  beacon.py          — entry point: _web_stop, _pyqt_stop, main
"""

import sys, os, subprocess, threading, json as _json
import urllib.request
from pathlib import Path


def _bootstrap_vendor_packages() -> None:
    vendor_site = Path(__file__).resolve().parent.parent / ".python-vendor" / "site-packages"
    if vendor_site.exists():
        sys.path.insert(0, str(vendor_site))


_bootstrap_vendor_packages()

from _beacon_config import COCKPIT_URL, load_settings, COUNTDOWN_SECONDS
from _beacon_popups import ContinuePopup, ConfirmPopup, terminal_screen_position

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import QTimer


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _cockpit_ready(timeout: float = 2.0) -> bool:
    try:
        r = urllib.request.urlopen(f"{COCKPIT_URL}/api/health", timeout=timeout)
        return r.status == 200
    except Exception:
        return False


def _current_agent() -> str:
    raw = os.environ.get("AGENT_CURRENT_AGENT", "").strip().lower()
    return raw if raw in ("claude", "codex", "gemini") else "claude"


def _create_web_session(label: str, session_content: str) -> str | None:
    data = _json.dumps({
        "project": label,
        "sessionContent": session_content,
        "currentAgent": _current_agent(),
    }).encode()
    req = urllib.request.Request(
        f"{COCKPIT_URL}/api/beacon",
        data=data, headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=5)
        return _json.loads(resp.read())["id"]
    except Exception:
        return None


def _patch_web_session(session_id: str, choice: str) -> None:
    try:
        data = _json.dumps({"choice": choice}).encode()
        req = urllib.request.Request(
            f"{COCKPIT_URL}/api/beacon/{session_id}",
            data=data, headers={"Content-Type": "application/json"}, method="PATCH",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass


# ── Stop handler ───────────────────────────────────────────────────────────────

def _web_stop(label: str, session_file: str) -> None:
    """PyQt-primary stop: popup opens immediately; web session created if Cockpit is already up.

    Old design: wait up to 30s for Cockpit to start, then open a Chromium --app= window,
    then launch PyQt as a background subprocess.  That caused 1-3+ second delays before
    the user saw anything.

    New design: PyQt is the primary UI (near-instant).  A web session is created only when
    Cockpit is already running (2s check, ~100ms POST).  The Control panel's ReadyBanner
    still detects the session; if the user clicks there the choice propagates back via PATCH.
    No browser window is opened, no npm dev process is started.
    """
    session_content = ""
    if session_file and os.path.exists(session_file):
        try:
            session_content = open(session_file).read().strip()
        except OSError:
            pass

    # Non-blocking: only create a web session when Cockpit is already running.
    session_id: str | None = None
    if _cockpit_ready():
        session_id = _create_web_session(label, session_content)

    _pyqt_stop(label, session_file, session_id)


# ── PyQt popup ─────────────────────────────────────────────────────────────────

def _pyqt_stop(label: str, session_file: str, session_id: str | None = None) -> None:
    os.environ.setdefault("DISPLAY", ":0")
    app = QApplication(sys.argv)
    app.setApplicationName("Beacon")
    popup = ContinuePopup("stop", label, session_file)
    popup.show()
    popup.raise_()
    popup.activateWindow()
    QTimer.singleShot(0, popup._position)

    # Poll the web session in a daemon thread every 3s so the PyQt popup closes
    # automatically if the user picks from the Control panel's ReadyBanner.
    # Non-blocking: HTTP runs off the Qt main thread; result dispatched via singleShot.
    _web_poll_active = [True]

    def _web_poll_loop():
        import time
        while _web_poll_active[0] and session_id:
            time.sleep(3)
            if not _web_poll_active[0]:
                break
            try:
                r = urllib.request.urlopen(
                    f"{COCKPIT_URL}/api/beacon/{session_id}", timeout=2)
                data = _json.loads(r.read())
                choice = data.get("choice")
                if choice is not None and _web_poll_active[0]:
                    # Marshal back to Qt main thread
                    QTimer.singleShot(0, lambda c=choice: popup._choose(c))
                    break
            except Exception:
                pass

    if session_id:
        threading.Thread(target=_web_poll_loop, daemon=True).start()

    app.exec()
    _web_poll_active[0] = False

    if popup.result:
        # Sync PyQt choice back to Cockpit so Control panel / any open tab can react.
        if session_id:
            threading.Thread(
                target=_patch_web_session, args=(session_id, popup.result), daemon=True
            ).start()
        print(popup.result)
        sys.exit(0)
    sys.exit(1)


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    os.environ.setdefault("DISPLAY", ":0")

    mode = sys.argv[1]
    if mode == "confirm":
        app = QApplication(sys.argv)
        app.setApplicationName("Beacon")
        tool    = sys.argv[2]
        cf      = sys.argv[3] if len(sys.argv) > 3 else ""
        command = open(cf).read().strip() if cf and os.path.exists(cf) else ""
        popup   = ConfirmPopup(tool, command)
        popup.show()
        popup.raise_()
        popup.activateWindow()
        QTimer.singleShot(0, popup._position)
        app.exec()
        if popup.result:
            print(popup.result)
            sys.exit(0)
        sys.exit(1)
    elif mode == "pyqt-stop":
        label = sys.argv[2]
        sf    = sys.argv[3] if len(sys.argv) > 3 else ""
        sid   = sys.argv[4] if len(sys.argv) > 4 else None
        _pyqt_stop(label, sf, sid)
    else:
        label = sys.argv[2]
        sf    = sys.argv[3] if len(sys.argv) > 3 else ""
        _web_stop(label, sf)


if __name__ == "__main__":
    main()
