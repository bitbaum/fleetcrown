#!/usr/bin/env python3
"""
Beacon — Claude Code desktop overlay for session stops and tool confirms.

Usage:
  beacon.py stop        <project_label> [session_file]
  beacon.py pyqt-stop   <project_label> [session_file] [session_id]
  beacon.py confirm     <tool_name> <cmd_file>

Stop priority:
  1. Browser popup  — opens the web beacon in a frameless Chrome/Brave --app= window.
                      Works without PyQt; identical UI on every platform. Requires
                      Cockpit to be running and a Chromium-family browser installed.
  2. PyQt popup     — native widget, instant (no Cockpit required), needs PyQt6.

Module layout:
  _beacon_theme.py   — color palettes + theme loading (no PyQt)
  _beacon_config.py  — runtime constants + settings/prompt-meta helpers (no PyQt)
  _beacon_audio.py   — WhisperThread speech-to-text
  _beacon_popups.py  — Qt stylesheet, widget helpers, ContinuePopup, ConfirmPopup
  beacon.py          — entry point: _web_stop, _pyqt_stop, main
"""

import sys, os, subprocess, threading, time, json as _json
import urllib.request
from pathlib import Path


def _bootstrap_vendor_packages() -> None:
    vendor_site = Path(__file__).resolve().parent.parent / ".python-vendor" / "site-packages"
    if vendor_site.exists():
        sys.path.insert(0, str(vendor_site))


_bootstrap_vendor_packages()

from _beacon_config import COCKPIT_URL, load_settings, COUNTDOWN_SECONDS


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


def _open_browser_beacon(session_id: str) -> bool:
    """Launch the web beacon URL in a focused browser window.

    Chrome-family browsers use --app= to open a frameless popup (no address bar,
    tabs, or browser chrome) that supports window.resizeTo/moveTo — matching the
    experience the beacon page was designed for.  Firefox and xdg-open are tried as
    fallbacks; they open a regular browser window instead of an app popup.

    Returns True if a browser process was launched, False if no browser was found.
    """
    import shutil
    url = f"{COCKPIT_URL}/beacon/{session_id}"

    candidates: list[list[str]] = []
    for b in ("chromium", "chromium-browser", "google-chrome", "brave-browser"):
        if shutil.which(b):
            candidates.append([b, f"--app={url}"])
            break
    if shutil.which("firefox"):
        candidates.append(["firefox", "--new-window", url])
    if shutil.which("xdg-open"):
        candidates.append(["xdg-open", url])

    for cmd in candidates:
        try:
            subprocess.Popen(
                cmd,
                start_new_session=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except (FileNotFoundError, OSError):
            continue
    return False


def _poll_beacon_choice(session_id: str, timeout: float = 130.0) -> str | None:
    """Block until the beacon session records a user choice or timeout elapses.

    The hook has a 150s timeout; 130s gives plenty of margin before it hard-kills
    the process and falls back to slot-1 auto-continue.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = urllib.request.urlopen(
                f"{COCKPIT_URL}/api/beacon/{session_id}", timeout=3)
            data = _json.loads(r.read())
            choice = data.get("choice")
            if choice is not None:
                return choice
        except Exception:
            pass
        time.sleep(0.5)
    return None


# ── Stop handler ───────────────────────────────────────────────────────────────

def _web_stop(label: str, session_file: str) -> None:
    """Primary stop handler — browser popup first, PyQt fallback.

    When Cockpit is already running the web beacon page is the preferred UI:
    it is identical on every platform, requires no PyQt installation, and gives
    the user the same interface whether they're clicking in the terminal or
    in a browser popup.

    Falls back to the PyQt native popup when:
      • Cockpit is not running (nothing to create a web session against), or
      • No browser was found on the system.

    If Cockpit IS running but the browser launch fails, the web session is still
    passed to PyQt so the Control panel's ReadyBanner can pick it up.
    """
    session_content = ""
    if session_file and os.path.exists(session_file):
        try:
            session_content = open(session_file).read().strip()
        except OSError:
            pass

    if _cockpit_ready():
        session_id = _create_web_session(label, session_content)
        if session_id and _open_browser_beacon(session_id):
            # Browser opened — block until the user picks or timeout.
            choice = _poll_beacon_choice(session_id)
            if choice:
                print(choice)
                sys.exit(0)
            sys.exit(1)
        # Browser unavailable — hand the session_id to PyQt so at least the
        # ReadyBanner in Cockpit Control panel can reflect the active session.
        _pyqt_stop(label, session_file, session_id)
        return

    # Cockpit not running — PyQt only, no web session.
    _pyqt_stop(label, session_file, None)


# ── PyQt popup ─────────────────────────────────────────────────────────────────

def _pyqt_stop(label: str, session_file: str, session_id: str | None = None) -> None:
    from _beacon_popups import ContinuePopup
    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtCore import QTimer

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
    _web_poll_active = [True]

    def _web_poll_loop() -> None:
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
                    QTimer.singleShot(0, lambda c=choice: popup._choose(c))
                    break
            except Exception:
                pass

    if session_id:
        threading.Thread(target=_web_poll_loop, daemon=True).start()

    app.exec()
    _web_poll_active[0] = False

    if popup.result:
        if session_id:
            threading.Thread(
                target=_patch_web_session, args=(session_id, popup.result), daemon=True
            ).start()
        print(popup.result)
        sys.exit(0)
    sys.exit(1)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(1)
    os.environ.setdefault("DISPLAY", ":0")

    mode = sys.argv[1]
    if mode == "confirm":
        from _beacon_popups import ConfirmPopup
        from PyQt6.QtWidgets import QApplication
        from PyQt6.QtCore import QTimer

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
