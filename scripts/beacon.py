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

import sys, os, subprocess
from pathlib import Path


def _bootstrap_vendor_packages() -> None:
    vendor_site = Path(__file__).resolve().parent.parent / ".python-vendor" / "site-packages"
    if vendor_site.exists():
        sys.path.insert(0, str(vendor_site))


_bootstrap_vendor_packages()

from _beacon_config import COCKPIT_URL, COUNTDOWN_SECONDS, load_settings
from _beacon_popups import ContinuePopup, ConfirmPopup, terminal_screen_position

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import QTimer


# ── Web beacon (primary path when Cockpit is running) ─────────────────────────

def _web_stop(label: str, session_file: str) -> None:
    """Open a Cockpit web page for the session-stop beacon instead of PyQt6."""
    import urllib.request, urllib.error, time, json as _json

    TIMEOUT_S = 120
    POLL_S = 0.8

    session_content = ""
    if session_file and os.path.exists(session_file):
        try:
            session_content = open(session_file).read().strip()
        except OSError:
            pass

    def _cockpit_ready() -> bool:
        try:
            # Use /api/health (instant response) not /api/control (slow DB+git endpoint)
            r = urllib.request.urlopen(f"{COCKPIT_URL}/api/health", timeout=5)
            return r.status == 200
        except Exception:
            return False

    def _start_cockpit():
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
        # Redirect stdout/stderr to DEVNULL — otherwise npm run dev inherits the bash
        # command substitution pipe and its startup output pollutes the captured choice.
        subprocess.Popen(
            ["bash", "-lc", "cd ~/dev/cockpit && npm run dev"],
            env=env, start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    def _open_browser(url: str):
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
        x, y = terminal_screen_position(520, 640)
        app_flags = ["--app=" + url, "--window-size=520,640", f"--window-position={x},{y}"]
        for cmd, extra in (
            (["brave-browser"], app_flags),
            (["google-chrome"], app_flags),
            (["chromium"], app_flags),
            (["chromium-browser"], app_flags),
            (["x-www-browser", url], []),
            (["xdg-open", url], []),
            (["firefox", url], []),
        ):
            try:
                full_cmd = cmd + extra if extra else cmd
                subprocess.Popen(full_cmd, env=env, start_new_session=True,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
            except FileNotFoundError:
                continue

    def _current_agent() -> str:
        raw = os.environ.get("AGENT_CURRENT_AGENT", "").strip().lower()
        if raw in ("claude", "codex", "gemini"):
            return raw
        return "claude"

    def _create_session() -> str | None:
        data = _json.dumps({
            "project": label,
            "sessionContent": session_content,
            "currentAgent": _current_agent(),
        }).encode()
        req  = urllib.request.Request(
            f"{COCKPIT_URL}/api/beacon",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=5)
            return _json.loads(resp.read())["id"]
        except Exception:
            return None

    def _poll_choice(session_id: str, deadline: float) -> str | None:
        url = f"{COCKPIT_URL}/api/beacon/{session_id}"
        while time.time() < deadline:
            try:
                # 8s timeout: 3s was too tight for cold Next.js route compilation
                resp = urllib.request.urlopen(url, timeout=8)
                data = _json.loads(resp.read())
                # Use `is not None` — empty string "" signals cancellation and must
                # be returned so the bash caller can `[ -z "$choice" ] && exit 0`.
                if data.get("choice") is not None:
                    return data["choice"]
            except Exception:
                pass
            time.sleep(POLL_S)
        return None

    # Ensure Cockpit is running
    if not _cockpit_ready():
        _start_cockpit()
        deadline = time.time() + 30
        while time.time() < deadline:
            if _cockpit_ready():
                break
            time.sleep(1)
        if not _cockpit_ready():
            _pyqt_stop(label, session_file)
            return

    session_id = _create_session()
    if not session_id:
        _pyqt_stop(label, session_file)
        return

    # Standard path: Open browser for Web Beacon, BUT ALSO keep PyQt popup as a fallback/overlay.
    # This allows coordinated closing when either UI is used.
    _s = load_settings()
    countdown = int(_s.get("countdown_seconds", _s.get("countdown_secs", COUNTDOWN_SECONDS)))
    _open_browser(f"{COCKPIT_URL}/beacon/{session_id}?countdown={countdown}")

    # Launch PyQt in the background so it doesn't block polling, but can still
    # update the web session if the user clicks it.
    pyqt_proc = subprocess.Popen(
        ["python3", str(Path(__file__).resolve()), "pyqt-stop", label, session_file, session_id],
        stdout=subprocess.PIPE, text=True,
    )

    # Poll web session for choice (from browser or PyQt)
    choice = _poll_choice(session_id, time.time() + TIMEOUT_S)
    
    # Clean up PyQt proc if choice came from browser
    if pyqt_proc.poll() is None:
        pyqt_proc.terminate()

    if choice is not None:
        print(choice)
        sys.exit(0)
    sys.exit(1)


# ── PyQt fallback (when Cockpit is unavailable) ────────────────────────────────

def _pyqt_stop(label: str, session_file: str, session_id: str = None) -> None:
    os.environ.setdefault("DISPLAY", ":0")
    app = QApplication(sys.argv)
    app.setApplicationName("Beacon")
    popup = ContinuePopup("stop", label, session_file)
    popup.show()
    popup.raise_()
    popup.activateWindow()
    QTimer.singleShot(0, popup._position)
    app.exec()
    if popup.result:
        # If we have a web session ID, sync the choice back to Cockpit so
        # other views (like a stray browser popup) can close/cancel.
        if session_id:
            import urllib.request, json as _json
            try:
                data = _json.dumps({"choice": popup.result}).encode()
                req  = urllib.request.Request(
                    f"{COCKPIT_URL}/api/beacon/{session_id}",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="PATCH",
                )
                urllib.request.urlopen(req, timeout=2)
            except Exception:
                pass

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
        sf    = sys.argv[3] if len(sys.argv) > 4 else ""
        _web_stop(label, sf)


if __name__ == "__main__":
    main()
