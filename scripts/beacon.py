#!/usr/bin/env python3
"""
Beacon — Claude Code desktop overlay for session stops and tool confirms.

Usage:
  beacon.py stop    <project_label> [session_file]
  beacon.py confirm <tool_name> <cmd_file>
"""

import sys, os, json, subprocess
from pathlib import Path


def _bootstrap_vendor_packages() -> None:
    script_dir = Path(__file__).resolve().parent
    vendor_site = script_dir.parent / ".python-vendor" / "site-packages"
    if vendor_site.exists():
        sys.path.insert(0, str(vendor_site))


_bootstrap_vendor_packages()

from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QLineEdit, QFrame,
    QScrollArea,
)
from PyQt6.QtCore import Qt, QTimer, QThread, pyqtSignal
from PyQt6.QtGui import QColor, QCursor, QFont, QPalette


# ── Whisper speech-to-text ────────────────────────────────────────────────────

class WhisperThread(QThread):
    transcribed = pyqtSignal(str)
    failed      = pyqtSignal(str)
    # Emitted while recording is still active — carries peak amplitude 0.0–1.0
    level       = pyqtSignal(float)
    RATE = 16_000

    def __init__(self, model: str = "base"):
        super().__init__()
        self._recording  = True
        self._model_name = model

    def stop_recording(self):
        self._recording = False

    def run(self):
        try:
            import sounddevice as sd, numpy as np, whisper
            frames = []
            def cb(indata, *_):
                if self._recording:
                    frames.append(indata.copy())
                    peak = float(np.abs(indata).max())
                    self.level.emit(peak)
            with sd.InputStream(samplerate=self.RATE, channels=1,
                                dtype="float32", callback=cb):
                while self._recording:
                    self.msleep(80)
            if not frames:
                self.failed.emit("No audio captured — check your microphone")
                return
            audio = np.concatenate(frames).flatten()
            peak  = float(np.abs(audio).max())
            if peak < 0.003:
                self.failed.emit("Microphone too quiet — speak closer or raise input volume")
                return
            out  = whisper.load_model(self._model_name).transcribe(audio, fp16=False)
            text = out.get("text", "").strip()
            if text:
                self.transcribed.emit(text)
            else:
                self.failed.emit("No speech detected — try speaking more clearly")
        except Exception as exc:
            self.failed.emit(str(exc))


# ── Palette ───────────────────────────────────────────────────────────────────

_THEME_PATH = os.path.expanduser("~/.config/agent-dashboard-theme.json")

def _is_dark_mode() -> bool:
    """Detect OS-level dark/light preference (GNOME + KDE)."""
    # GNOME: explicit color-scheme setting
    try:
        r = subprocess.run(
            ["gsettings", "get", "org.gnome.desktop.interface", "color-scheme"],
            capture_output=True, text=True, timeout=1,
        )
        out = r.stdout.strip().strip("'\"").lower()
        if "prefer-dark" in out:
            return True
        if "prefer-light" in out:
            return False
        # "default" → fall through to other checks
    except Exception:
        pass
    # KDE Plasma: color scheme name contains "dark"
    try:
        r = subprocess.run(
            ["kreadconfig5", "--group", "General", "--key", "ColorScheme"],
            capture_output=True, text=True, timeout=1,
        )
        scheme = r.stdout.strip().lower()
        if scheme:
            return "dark" in scheme
    except Exception:
        pass
    # GNOME fallback: GTK theme name
    try:
        r = subprocess.run(
            ["gsettings", "get", "org.gnome.desktop.interface", "gtk-theme"],
            capture_output=True, text=True, timeout=1,
        )
        return "dark" in r.stdout.lower()
    except Exception:
        pass
    return True  # default: dark

_DARK_PALETTE = dict(
    card             = "#111111",
    surface          = "#1a1a1a",
    surface2         = "#222222",
    border           = "#2c2c2c",
    group_bg         = "#0d0d0d",
    accent           = "#e8e8e8",
    accent_d         = "#1a1a1a",
    btn_primary_bg   = "#e8e8e8",
    btn_primary_fg   = "#111111",
    btn_primary_hover= "#cccccc",
    allow_hover      = "#163322",
    deny_hover       = "#3d1212",
    label_next       = "#38bdf8",
    label_progress   = "#fbbf24",
    ship             = "#4ade80",
    ship_d           = "#0d2b1a",
    text1            = "#eaeaea",
    text2            = "#909090",
    text3            = "#555555",
    group_lbl        = "#5c5c5c",
    green            = "#4ade80",
    green_d          = "#0d2b1a",
    amber            = "#fbbf24",
    amber_d          = "#2a1800",
    red              = "#f87171",
    red_d            = "#2d0f0f",
    cyan             = "#38bdf8",
    purple           = "#c084fc",
)

_LIGHT_PALETTE = dict(
    card             = "#ffffff",
    surface          = "#f5f5f5",
    surface2         = "#ededed",
    border           = "#d4d4d4",
    group_bg         = "#f0f0f0",
    accent           = "#111111",
    accent_d         = "#f5f5f5",
    btn_primary_bg   = "#111111",
    btn_primary_fg   = "#ffffff",
    btn_primary_hover= "#333333",
    allow_hover      = "#15803d",
    deny_hover       = "#b91c1c",
    label_next       = "#0369a1",
    label_progress   = "#92400e",
    ship             = "#15803d",
    ship_d           = "#dcfce7",
    text1            = "#111111",
    text2            = "#555555",
    text3            = "#909090",
    group_lbl        = "#909090",
    green            = "#15803d",
    green_d          = "#dcfce7",
    amber            = "#92400e",
    amber_d          = "#fef3c7",
    red              = "#b91c1c",
    red_d            = "#fee2e2",
    cyan             = "#0369a1",
    purple           = "#7c3aed",
)

def _load_theme() -> dict:
    is_dark = _is_dark_mode()
    default_theme = dict(_DARK_PALETTE if is_dark else _LIGHT_PALETTE)
    try:
        if os.path.exists(_THEME_PATH):
            loaded = json.load(open(_THEME_PATH))
            # Support nested {"dark": {...}, "light": {...}} from export-beacon-theme.py
            mode_key = "dark" if is_dark else "light"
            if mode_key in loaded:
                default_theme.update(loaded[mode_key])
            elif not any(k in loaded for k in ("dark", "light")):
                default_theme.update(loaded)  # legacy flat format
    except Exception:
        pass
    return default_theme

C = _load_theme()

SS = """
/* ── Card ── */
QWidget#card {{
    background: {card};
    border-radius: 16px;
    border: 1px solid {border};
}}

/* ── Typography ── */
QLabel#proj {{
    color: {text1};
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.3px;
}}
QLabel#status_badge {{
    color: {text2};
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    background: {surface};
    border-radius: 10px;
    border: 1px solid {border};
}}
QLabel#divider {{
    background: {border};
    max-height: 1px;
    min-height: 1px;
}}
QLabel#group_label {{
    color: {group_lbl};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.2px;
    padding: 0px 2px;
}}
QLabel#countdown {{
    color: {amber};
    font-size: 12px;
    font-weight: 600;
}}
QLabel#hint {{
    color: {text3};
    font-size: 11px;
}}

/* ── Session summary ── */
QWidget#summary_card {{
    background: {surface};
    border-radius: 14px;
    border: 1px solid {border};
}}
QWidget#summary_scroll_content {{
    background: transparent;
}}
QLabel#sum_val {{
    color: {text1};
    font-size: 14px;
    line-height: 1.5;
    background: transparent;
}}

/* ── Minimal scrollbar ── */
QScrollArea {{
    background: transparent;
    border: none;
}}
QScrollBar:vertical {{
    background: transparent;
    width: 5px;
    margin: 4px 2px 4px 0;
}}
QScrollBar::handle:vertical {{
    background: {border};
    border-radius: 3px;
    min-height: 24px;
}}
QScrollBar::handle:vertical:hover {{
    background: {text3};
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}
QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{
    background: transparent;
}}

/* ── Action buttons — DEV group ── */
QPushButton#primary {{
    background: {btn_primary_bg};
    color: {btn_primary_fg};
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-align: left;
}}
QPushButton#primary:hover {{
    background: {btn_primary_hover};
    color: {btn_primary_fg};
}}
QPushButton#action {{
    background: transparent;
    color: {text2};
    border: 1px solid {border};
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    text-align: left;
}}
QPushButton#action:hover {{
    background: {surface};
    color: {text1};
    border-color: {text3};
}}

/* ── Action buttons — SHIP group ── */
QPushButton#ship_primary {{
    background: {ship_d};
    color: {ship};
    border: 1.5px solid {ship};
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-align: left;
}}
QPushButton#ship_primary:hover {{
    background: {allow_hover};
    color: {text1};
    border-color: {ship};
}}
QPushButton#ship_action {{
    background: transparent;
    color: {text2};
    border: 1px solid {border};
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    text-align: left;
}}
QPushButton#ship_action:hover {{
    background: {surface};
    color: {text1};
    border-color: {ship};
}}

/* ── Dashboard button ── */
QPushButton#dash {{
    background: {surface};
    color: {text3};
    border: 1px solid {border};
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
}}
QPushButton#dash:hover {{
    color: {text2};
    background: {surface2};
    border-color: {accent};
}}

/* ── Close (×) button ── */
QPushButton#close_btn {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 6px;
    font-size: 16px;
    min-width: 26px;
    max-width: 26px;
    min-height: 26px;
    max-height: 26px;
    padding: 0px;
}}
QPushButton#close_btn:hover {{
    background: {red_d};
    color: {red};
}}

/* ── More toggle & items ── */
QPushButton#more_toggle {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 8px;
    padding: 6px 4px;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
}}
QPushButton#more_toggle:hover {{
    color: {text2};
    background: {surface};
}}
QPushButton#more_item {{
    background: transparent;
    color: {text2};
    border: none;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    text-align: left;
}}
QPushButton#more_item:hover {{
    background: {surface};
    color: {text1};
}}

/* ── Custom input ── */
QLineEdit#custom {{
    background: {surface};
    color: {text1};
    border: 1.5px solid {border};
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13px;
    selection-background-color: {surface2};
}}
QLineEdit#custom:focus {{
    border-color: {text3};
    background: {surface2};
}}

/* ── Confirm popup ── */
QWidget#code_box {{
    background: {group_bg};
    border-radius: 10px;
    border: 1px solid {border};
}}
QLabel#code {{
    color: {cyan};
    font-family: monospace;
    font-size: 12px;
    padding: 12px;
    background: transparent;
}}
QPushButton#allow {{
    background: {green_d};
    color: {green};
    border: 1.5px solid {green};
    border-radius: 10px;
    padding: 11px 16px;
    font-size: 13px;
    font-weight: 700;
}}
QPushButton#allow:hover {{ background: {allow_hover}; }}
QPushButton#deny {{
    background: {red_d};
    color: {red};
    border: 1.5px solid {red};
    border-radius: 10px;
    padding: 11px 16px;
    font-size: 13px;
    font-weight: 700;
}}
QPushButton#deny:hover {{ background: {deny_hover}; }}
""".format(**C)

COUNTDOWN_SECONDS = 12   # default; overridden by settings file if present

_SETTINGS_PATH = os.path.expanduser("~/.config/agent-dashboard-settings.json")
_META_PATH      = os.path.expanduser("~/.config/agent-prompts.json")
_LEGACY_META_PATH = os.path.expanduser("~/.config/claude-prompts.json")

def _load_settings() -> dict:
    try:
        if os.path.exists(_SETTINGS_PATH):
            return json.load(open(_SETTINGS_PATH))
    except Exception:
        pass
    return {}

def _load_prompt_meta() -> list:
    """Load prompt metadata from SSOT config file."""
    try:
        file = _META_PATH if os.path.exists(_META_PATH) else _LEGACY_META_PATH
        if os.path.exists(file):
            return json.load(open(file))
    except Exception:
        pass
    return []

# ── Helpers ───────────────────────────────────────────────────────────────────

class DraggableCard(QWidget):
    """Card widget that lets the user drag the whole popup window."""
    def __init__(self):
        super().__init__()
        self._drag_pos = None

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            wh = self.window().windowHandle()
            if wh:
                wh.startSystemMove()
            else:
                self._drag_pos = event.globalPosition().toPoint() - self.window().frameGeometry().topLeft()
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton and self._drag_pos is not None:
            self.window().move(event.globalPosition().toPoint() - self._drag_pos)
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self._drag_pos = None
        super().mouseReleaseEvent(event)


class SafeButton(QPushButton):
    def keyPressEvent(self, e):
        if e.key() == Qt.Key.Key_Space:
            e.ignore()
        else:
            super().keyPressEvent(e)

class FocusCancelInput(QLineEdit):
    def __init__(self, on_focus, on_engage=None):
        super().__init__()
        self._on_focus = on_focus
        self._on_engage = on_engage

    def mousePressEvent(self, e):
        # Fire on_engage BEFORE super() so the window accepts focus by the
        # time Qt tries to forward keyboard events to this widget.
        if self._on_engage:
            self._on_engage()
        super().mousePressEvent(e)

    def focusInEvent(self, e):
        self._on_focus()
        w = self.window()
        if w:
            w.activateWindow()
            w.raise_()
        super().focusInEvent(e)


# ── Base popup ────────────────────────────────────────────────────────────────

class BasePopup(QWidget):
    def __init__(self, timeout_ms=35_000):
        super().__init__()
        self.result = None
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool |
            Qt.WindowType.WindowDoesNotAcceptFocus
        )
        # Solid background — WA_TranslucentBackground causes fully-transparent
        # windows on Linux without a compositor. Use QPalette instead so the
        # window always paints the card colour regardless of compositor state.
        pal = self.palette()
        pal.setColor(QPalette.ColorRole.Window, QColor(C["card"]))
        self.setPalette(pal)
        self.setAutoFillBackground(True)
        self.setStyleSheet(SS)
        self._dismiss_timer = QTimer(singleShot=True)
        self._dismiss_timer.timeout.connect(self._dismiss)
        self._dismiss_timer.start(timeout_ms)

    def _pause_dismiss(self):
        self._dismiss_timer.stop()

    def _resume_dismiss(self, ms=60_000):
        self._dismiss_timer.start(ms)

    def _make_card(self, width=440):
        card = DraggableCard()
        card.setObjectName("card")
        card.setFixedWidth(width)
        return card

    def _divider(self):
        d = QLabel()
        d.setObjectName("divider")
        return d

    def _position(self):
        # Appear on whichever screen the terminal is on
        self.adjustSize()
        w, h = self.sizeHint().width(), self.sizeHint().height()
        x, y = _terminal_screen_position(w, h)
        self.move(x, y)

    def _choose(self, key):
        self.result = key
        self.close()
        QApplication.instance().quit()

    def _dismiss(self):
        self.result = None
        self.close()
        QApplication.instance().quit()

    def keyPressEvent(self, e):
        if e.key() == Qt.Key.Key_Escape:
            self._dismiss()
        else:
            super().keyPressEvent(e)


# ── Continue popup ────────────────────────────────────────────────────────────

class ContinuePopup(BasePopup):

    WHISPER_MODELS = ["tiny", "base", "small", "medium"]

    def __init__(self, mode: str, label: str, session_file: str = ""):
        super().__init__(timeout_ms=35_000)
        self.mode  = mode
        self.label = label
        _s    = _load_settings()
        _meta = _load_prompt_meta()
        self._secs = int(_s.get("countdown_seconds", _s.get("countdown_secs", COUNTDOWN_SECONDS)))
        # Build action lists from SSOT meta — slot ≤ 6 core, slot ≥ 7 more
        self.ACTIONS      = [(str(m["slot"]), m["icon"], m["label"], m.get("style","action"))
                             for m in _meta if m.get("style") in ("primary","action")]
        self.MORE_ACTIONS = [(str(m["slot"]), m["icon"], m["label"])
                             for m in _meta if m.get("style") == "more"]
        self._timer           = None
        self._countdown_label = None
        self._custom_input    = None
        self._mic_btn         = None
        self._mic_status      = None
        self._model_btn       = None
        self._whisper         = None
        self._mic_state       = "idle"
        self._input_engaged   = False   # set on first click of the custom field
        self._whisper_model   = _s.get("whisper_model", "base")
        self._rec_secs        = 0
        self._auto_secs       = 0
        self._auto_timer      = QTimer()
        self._action_btns     = []   # all buttons in order for keyboard nav
        self.session          = ""
        if session_file and os.path.exists(session_file):
            try:
                self.session = open(session_file).read().strip()
            except OSError:
                pass
        self._build()
        self._position()
        if mode == "stop":
            self._start_countdown()

    # ── countdown ─────────────────────────────────────────────────────────────

    def _cancel_countdown(self):
        if self._timer and self._timer.isActive():
            self._timer.stop()
        self._pause_dismiss()   # user is engaging — don't auto-dismiss either
        if self._countdown_label:
            self._countdown_label.setText("↵ Enter to send")

    def _engage_input(self):
        """Called when user clicks the custom input field.

        On X11/Linux, WindowDoesNotAcceptFocus tells the WM never to grant
        keyboard focus to this window — even after a deliberate click.
        We strip that hint and re-show the window so the WM routes keystrokes
        here from this point on.
        """
        self._input_engaged = True
        self._cancel_countdown()
        flags = self.windowFlags()
        if flags & Qt.WindowType.WindowDoesNotAcceptFocus:
            self.setWindowFlags(flags & ~Qt.WindowType.WindowDoesNotAcceptFocus)
            self.show()   # re-apply window flags (brief repaint, position unchanged)
        self.activateWindow()
        self.raise_()
        if self._custom_input:
            self._custom_input.setFocus(Qt.FocusReason.MouseFocusReason)

    def _start_countdown(self):
        self._timer = QTimer(interval=1000)
        self._timer.timeout.connect(self._tick)
        self._timer.start()

    def _tick(self):
        # If user clicked the input OR has started typing, cancel the countdown
        if self._input_engaged or (self._custom_input and self._custom_input.text().strip()):
            self._cancel_countdown()
            return
        self._secs -= 1
        if self._secs <= 0:
            self._timer.stop()
            self._choose("1")
        elif self._countdown_label:
            self._countdown_label.setText(
                f"Auto-running ⚡ in {self._secs}s  ·  Esc to cancel")

    def _choose(self, key):
        # Only block an auto/button choice if the user has actually typed a custom prompt.
        # _input_engaged alone (clicked but empty) should not block explicit button presses.
        if not key.startswith("custom:") and self._custom_input and self._custom_input.text().strip():
            self._cancel_countdown()
            return
        if self._timer and self._timer.isActive():
            self._timer.stop()
        super()._choose(key)

    def _dismiss(self):
        # Never auto-dismiss while the user has clicked the input or is composing
        if self._input_engaged or (self._custom_input and self._custom_input.text().strip()):
            self._pause_dismiss()
            return
        if self._timer and self._timer.isActive():
            self._timer.stop()
        super()._dismiss()

    # ── session summary ───────────────────────────────────────────────────────

    def _build_summary(self, lay):
        parsed = {}
        for line in self.session.strip().split('\n'):
            if ':' in line:
                k, _, v = line.partition(':')
                k = k.strip().lower()
                if k in ('done', 'next', 'in_progress', 'tests', 'todos', 'health'):
                    parsed[k] = v.strip()

        box = QWidget()
        box.setObjectName("summary_card")
        box_lay = QVBoxLayout(box)
        box_lay.setContentsMargins(18, 16, 18, 16)
        box_lay.setSpacing(10)

        W = 548  # max label width inside the card

        def _section_label(text, color):
            lbl = QLabel(text)
            lbl.setStyleSheet(
                f"color:{color};font-size:10px;font-weight:700;"
                f"letter-spacing:1.5px;background:transparent;")
            return lbl

        def _make_bullet(text, char, color, size=14):
            row = QHBoxLayout()
            row.setSpacing(8)
            row.setContentsMargins(0, 1, 0, 1)
            b = QLabel(char)
            b.setStyleSheet(f"color:{color};font-size:{size}px;font-weight:700;background:transparent;")
            b.setFixedWidth(16)
            row.addWidget(b, 0, Qt.AlignmentFlag.AlignTop)
            v = QLabel(text)
            v.setWordWrap(True)
            v.setMaximumWidth(W)
            v.setStyleSheet(f"color:{C['text1']};font-size:{size}px;background:transparent;")
            v.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            row.addWidget(v, 1)
            return row

        # ── UP NEXT — always fully visible, it's what drives the next action ──
        if 'next' in parsed:
            box_lay.addWidget(_section_label("UP NEXT", C['label_next']))
            box_lay.addSpacing(4)
            for itm in [s.strip() for s in parsed['next'].split('; ') if s.strip()]:
                box_lay.addLayout(_make_bullet(itm, "→", C['label_next']))

        # ── IN PROGRESS — visible when present ───────────────────────────────
        if 'in_progress' in parsed:
            if 'next' in parsed:
                box_lay.addSpacing(8)
            box_lay.addWidget(_section_label("IN PROGRESS", C['label_progress']))
            box_lay.addSpacing(4)
            for itm in [s.strip() for s in parsed['in_progress'].split('; ') if s.strip()]:
                box_lay.addLayout(_make_bullet(itm, "◉", C['label_progress']))

        # ── DONE — collapsed by default: count chip + expand ─────────────────
        if 'done' in parsed:
            done_items = [s.strip() for s in parsed['done'].split('; ') if s.strip()]
            if 'next' in parsed or 'in_progress' in parsed:
                box_lay.addSpacing(10)

            done_row = QHBoxLayout()
            done_row.setSpacing(6)
            done_lbl = QLabel(f"DONE  ·  {len(done_items)} completed")
            done_lbl.setStyleSheet(
                f"color:{C['text3']};font-size:10px;font-weight:700;letter-spacing:1.2px;background:transparent;")
            done_row.addWidget(done_lbl)
            done_row.addStretch()

            toggle_btn = QPushButton("▸")
            toggle_btn.setStyleSheet(
                f"background:transparent;color:{C['text3']};border:none;"
                f"font-size:13px;padding:1px 6px;"
            )
            toggle_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            done_row.addWidget(toggle_btn)
            box_lay.addLayout(done_row)

            done_body = QWidget()
            done_body.setVisible(False)
            done_body_lay = QVBoxLayout(done_body)
            done_body_lay.setContentsMargins(0, 4, 0, 0)
            done_body_lay.setSpacing(4)
            for itm in done_items:
                done_body_lay.addLayout(_make_bullet(itm, "✓", C['green'], size=13))

            def _toggle_done(checked=False, body=done_body, btn=toggle_btn):
                vis = body.isVisible()
                body.setVisible(not vis)
                btn.setText("▾" if not vis else "▸")
                # Scroll to the bottom after expanding so DONE items are visible
                if not vis:
                    QTimer.singleShot(50, lambda: scr_area.verticalScrollBar().setValue(
                        scr_area.verticalScrollBar().maximum()))

            toggle_btn.clicked.connect(_toggle_done)
            box_lay.addWidget(done_body)

        # ── Fallback: raw session text ────────────────────────────────────────
        if not any(k in parsed for k in ('next', 'in_progress', 'done')):
            v = QLabel(self.session)
            v.setWordWrap(True)
            v.setMaximumWidth(W)
            v.setStyleSheet(f"color:{C['text1']};font-size:15px;background:transparent;")
            v.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            box_lay.addWidget(v)

        box_lay.addStretch()

        # Wrap in a scroll area so expanded DONE never overflows the screen
        scr_area = QScrollArea()
        scr_area.setWidget(box)
        scr_area.setWidgetResizable(True)
        scr_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scr_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scr_area.setFrameShape(QFrame.Shape.NoFrame)
        scr_area.setStyleSheet("background:transparent;border:none;")
        scr_area.viewport().setStyleSheet("background:transparent;")
        avail_h = (QApplication.screenAt(QCursor.pos()) or QApplication.primaryScreen()).availableGeometry().height()
        scr_area.setMaximumHeight(int(avail_h * 0.55))

        lay.addWidget(scr_area)

    # ── mic / whisper ─────────────────────────────────────────────────────────

    _SS_MIC = {
        "idle":
            f"background:{C['surface']};color:{C['text3']};border:1px solid {C['border']};"
            f"border-radius:10px;font-size:16px;min-width:42px;max-width:42px;"
            f"min-height:42px;max-height:42px;",
        "recording":
            f"background:{C['red_d']};color:{C['red']};border:2px solid {C['red']};"
            f"border-radius:10px;font-size:11px;font-weight:700;"
            f"min-width:58px;max-width:58px;min-height:42px;max-height:42px;",
        "transcribing":
            f"background:{C['amber_d']};color:{C['amber']};border:2px solid {C['amber']};"
            f"border-radius:10px;font-size:11px;"
            f"min-width:58px;max-width:58px;min-height:42px;max-height:42px;",
    }
    _SS_MODEL = (
        f"background:{C['surface']};color:{C['text3']};border:1px solid {C['border']};"
        f"border-radius:6px;font-size:10px;padding:2px 7px;"
        f"min-height:18px;max-height:18px;"
    )

    def _mic_clicked(self):
        if self._mic_state == "idle":
            self._start_recording()
        elif self._mic_state == "recording":
            self._stop_recording()

    def _start_recording(self):
        self._cancel_countdown()
        self._pause_dismiss()
        self._mic_state = "recording"
        self._rec_secs  = 0
        self._apply_mic("recording", "● 0s")
        self._set_mic_status("Recording  ·  speak now  ·  click 🎤 to stop", C['amber'])
        self._rec_timer = QTimer(interval=1000)
        self._rec_timer.timeout.connect(self._rec_tick)
        self._rec_timer.start()
        self._rec_peak  = 0.0
        self._whisper = WhisperThread(model=self._whisper_model)
        self._whisper.transcribed.connect(self._on_transcribed)
        self._whisper.failed.connect(self._on_transcribe_error)
        self._whisper.finished.connect(self._on_thread_finished)
        self._whisper.level.connect(self._on_mic_level)
        self._whisper.start()

    def _on_mic_level(self, peak: float):
        self._rec_peak = max(self._rec_peak, peak)

    def _rec_tick(self):
        self._rec_secs += 1
        # Show a simple level bar so the user knows the mic is picking up audio
        bars = min(8, int(self._rec_peak * 40))
        level_str = "▮" * bars + "▯" * (8 - bars)
        self._apply_mic("recording", f"● {self._rec_secs}s")
        if self._mic_status:
            self._set_mic_status(
                f"Recording  ·  {level_str}  ·  click 🎤 to stop",
                C['red'] if self._rec_peak > 0.003 else C['amber'],
            )
        self._rec_peak = 0.0  # reset for next tick window

    def _stop_recording(self):
        if hasattr(self, "_rec_timer"):
            self._rec_timer.stop()
        if self._whisper:
            self._whisper.stop_recording()
        self._mic_state = "transcribing"
        self._apply_mic("transcribing", "⋯ …")
        self._set_mic_status("Transcribing…", C['amber'])
        if self._mic_btn:
            self._mic_btn.setEnabled(False)

    def _on_transcribed(self, text: str):
        if self._custom_input:
            cur = self._custom_input.text().strip()
            self._custom_input.setText((cur + " " + text).strip() if cur else text)
            self._custom_input.setFocus()
        self._auto_secs = 5
        self._set_mic_status(f"✓  Sending in {self._auto_secs}s  ·  edit to pause", C['green'])
        self._auto_timer = QTimer(interval=1000)
        self._auto_timer.timeout.connect(self._auto_tick)
        self._auto_timer.start()
        self._custom_input.textEdited.connect(self._cancel_auto_submit)

    def _auto_tick(self):
        self._auto_secs -= 1
        if self._auto_secs <= 0:
            self._auto_timer.stop()
            self._submit_custom()
        else:
            self._set_mic_status(f"✓  Sending in {self._auto_secs}s  ·  edit to pause", C['green'])

    def _cancel_auto_submit(self):
        if self._auto_timer.isActive():
            self._auto_timer.stop()
            self._set_mic_status("✓  Ready  ·  press Enter to send", C['green'])

    def _on_transcribe_error(self, msg: str):
        self._resume_dismiss(60_000)
        self._set_mic_status(f"Error: {msg[:72]}", C['red'])

    def _on_thread_finished(self):
        self._mic_state = "idle"
        self._apply_mic("idle", "🎤")
        if self._mic_btn:
            self._mic_btn.setEnabled(True)

    def _apply_mic(self, state: str, text: str):
        if self._mic_btn:
            self._mic_btn.setText(text)
            self._mic_btn.setStyleSheet(self._SS_MIC[state])

    def _set_mic_status(self, msg: str, color: str):
        if self._mic_status:
            self._mic_status.setText(msg)
            self._mic_status.setStyleSheet(
                f"color:{color};font-size:11px;font-weight:500;padding:2px 0;")
            self._mic_status.setVisible(True)

    def _cycle_model(self):
        idx = self.WHISPER_MODELS.index(self._whisper_model)
        self._whisper_model = self.WHISPER_MODELS[(idx + 1) % len(self.WHISPER_MODELS)]
        if self._model_btn:
            self._model_btn.setText(self._whisper_model)

    # ── build ─────────────────────────────────────────────────────────────────

    def _build(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        card = self._make_card(600)
        lay  = QVBoxLayout(card)
        lay.setContentsMargins(20, 18, 20, 16)
        lay.setSpacing(0)

        # ── Header ──
        hdr = QHBoxLayout()
        hdr.setSpacing(8)

        proj = QLabel(self.label)
        proj.setObjectName("proj")
        hdr.addWidget(proj)
        hdr.addStretch()

        dash_btn = QPushButton("⊞ Cockpit")
        dash_btn.setObjectName("dash")
        dash_btn.setToolTip("Open Cockpit control panel (localhost:3000/control)")
        dash_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        dash_btn.clicked.connect(self._open_cockpit)
        hdr.addWidget(dash_btn)

        dot_color  = C['green'] if self.mode == "stop" else C['amber']
        dot_char   = "●" if self.mode == "stop" else "◉"
        badge_text = "done" if self.mode == "stop" else "waiting"
        badge = QLabel(f"{dot_char}  {badge_text}")
        badge.setStyleSheet(
            f"color:{dot_color};font-size:11px;font-weight:700;"
            f"padding:3px 10px;background:{C['surface']};border-radius:10px;"
            f"border:1px solid {dot_color}44;")
        hdr.addWidget(badge)

        close_btn = QPushButton("×")
        close_btn.setObjectName("close_btn")
        close_btn.setToolTip("Dismiss  (Esc)")
        close_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        close_btn.clicked.connect(self._dismiss)
        hdr.addWidget(close_btn)

        lay.addLayout(hdr)

        lay.addSpacing(14)
        lay.addWidget(self._divider())
        lay.addSpacing(12)

        # ── Session summary ──
        if self.session:
            self._build_summary(lay)
            lay.addSpacing(12)
            lay.addWidget(self._divider())
            lay.addSpacing(12)

        # ── Core action buttons ──
        for key, icon, lbl_text, style in self.ACTIONS:
            btn = SafeButton(f"  {icon}   {lbl_text}   [{key}]")
            btn.setObjectName(style)
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.clicked.connect(lambda _, k=key: self._choose(k))
            btn.pressed.connect(self._cancel_countdown)
            lay.addWidget(btn)
            lay.addSpacing(3)
            self._action_btns.append(btn)

        lay.addSpacing(4)

        # ── More prompts (collapsed by default) ──
        self._more_frame = QWidget()
        self._more_frame.setVisible(False)
        more_lay = QVBoxLayout(self._more_frame)
        more_lay.setContentsMargins(0, 0, 0, 0)
        more_lay.setSpacing(2)
        for key, icon, lbl_text in self.MORE_ACTIONS:
            btn = SafeButton(f"  {icon}  {lbl_text}")
            btn.setObjectName("more_item")
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.clicked.connect(lambda _, k=key: self._choose(k))
            btn.pressed.connect(self._cancel_countdown)
            more_lay.addWidget(btn)

        self._more_btn = SafeButton(f"▸  More prompts  ({len(self.MORE_ACTIONS)})")
        self._more_btn.setObjectName("more_toggle")
        self._more_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._more_btn.clicked.connect(self._toggle_more)
        self._more_btn.pressed.connect(self._cancel_countdown)
        lay.addWidget(self._more_btn)
        lay.addWidget(self._more_frame)

        lay.addSpacing(10)
        lay.addWidget(self._divider())
        lay.addSpacing(10)

        # ── Custom input + mic ──
        input_row = QHBoxLayout()
        input_row.setSpacing(8)

        self._custom_input = FocusCancelInput(self._cancel_countdown, self._engage_input)
        self._custom_input.setObjectName("custom")
        self._custom_input.setPlaceholderText("Custom prompt — type or speak…")
        self._custom_input.returnPressed.connect(self._submit_custom)
        self._custom_input.textChanged.connect(self._cancel_countdown)  # stop countdown on any input
        input_row.addWidget(self._custom_input)

        mic_col = QVBoxLayout()
        mic_col.setSpacing(3)
        mic_col.setContentsMargins(0, 0, 0, 0)

        self._mic_btn = SafeButton("🎤")
        self._mic_btn.setStyleSheet(self._SS_MIC["idle"])
        self._mic_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._mic_btn.clicked.connect(self._mic_clicked)
        self._mic_btn.pressed.connect(self._cancel_countdown)
        mic_col.addWidget(self._mic_btn)

        self._model_btn = SafeButton(self._whisper_model)
        self._model_btn.setStyleSheet(self._SS_MODEL)
        self._model_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._model_btn.setToolTip("Cycle: tiny · base · small · medium")
        self._model_btn.clicked.connect(self._cycle_model)
        mic_col.addWidget(self._model_btn, alignment=Qt.AlignmentFlag.AlignHCenter)

        input_row.addLayout(mic_col)
        lay.addLayout(input_row)

        # mic status (hidden until recording)
        self._mic_status = QLabel("")
        self._mic_status.setVisible(False)
        lay.addSpacing(4)
        lay.addWidget(self._mic_status)

        # ── Countdown / hint ──
        lay.addSpacing(8)
        if self.mode == "stop":
            self._countdown_label = QLabel(
                f"Auto-running ⚡ in {self._secs}s  ·  Esc to cancel")
            self._countdown_label.setObjectName("countdown")
            self._countdown_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(self._countdown_label)
        else:
            hint = QLabel("↑ ↓ navigate  ·  1–6 quick-pick  ·  Esc dismiss")
            hint.setObjectName("hint")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(hint)

        outer.addWidget(card)

        if self._action_btns:
            self._action_btns[0].setFocus()

    def _toggle_more(self):
        vis = self._more_frame.isVisible()
        self._more_frame.setVisible(not vis)
        self._more_btn.setText(
            f"▾  More prompts  ({len(self.MORE_ACTIONS)})" if not vis
            else f"▸  More prompts  ({len(self.MORE_ACTIONS)})")
        self.adjustSize()
        self._position()

    def _open_cockpit(self):
        import urllib.request
        url = "http://localhost:3000/control"
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}

        def _cockpit_ready():
            try:
                r = urllib.request.urlopen("http://localhost:3000/api/health", timeout=2)
                return r.status == 200
            except Exception:
                return False

        def _launch_browser():
            # xdg-open → kde-open5 fails silently when called from a detached process
            # (no KDE session IPC available). Use the system alternatives pointer directly.
            for cmd in (
                ["x-www-browser", url],
                ["xdg-open", url],
                ["brave-browser", url],
                ["firefox", url],
                ["google-chrome", url],
            ):
                try:
                    subprocess.Popen(
                        cmd, env=env, start_new_session=True,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    return
                except FileNotFoundError:
                    continue

        if _cockpit_ready():
            _launch_browser()
            return

        # Not running — start it, poll until /api/health responds, then open browser
        subprocess.Popen(
            ["bash", "-lc", "cd ~/dev/cockpit && npm run dev"],
            env=env, start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._cockpit_poll(0, url, env, _launch_browser)

    def _cockpit_poll(self, attempt, url, env, launch_browser):
        import urllib.request
        if attempt > 20:   # give up after 40s — never open a broken URL
            return
        try:
            r = urllib.request.urlopen("http://localhost:3000/api/health", timeout=2)
            if r.status == 200:
                launch_browser()
                return
        except Exception:
            pass
        QTimer.singleShot(2000, lambda: self._cockpit_poll(attempt + 1, url, env, launch_browser))

    def _submit_custom(self):
        text = self._custom_input.text().strip()
        if text:
            self._choose(f"custom:{text}")

    def keyPressEvent(self, e):
        key = e.key()
        if self.focusWidget() is self._custom_input:
            super().keyPressEvent(e)
            return
        if key == Qt.Key.Key_Escape:
            self._dismiss()
        elif key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            f = self.focusWidget()
            if isinstance(f, SafeButton):
                f.click()
            elif self._action_btns:
                self._action_btns[0].click()
        elif key == Qt.Key.Key_Up:
            self._shift_focus(-1)
        elif key == Qt.Key.Key_Down:
            self._shift_focus(1)
        # Number keys 1-6 for direct selection of core prompts
        elif Qt.Key.Key_1 <= key <= Qt.Key.Key_6:
            num = key - Qt.Key.Key_0
            idx = num - 1
            if 0 <= idx < len(self._action_btns):
                self._action_btns[idx].click()
        else:
            super().keyPressEvent(e)

    def _shift_focus(self, d: int):
        btns = self._action_btns
        f    = self.focusWidget()
        idx  = (btns.index(f) + d) % len(btns) if f in btns else 0
        btns[idx].setFocus()


# ── Confirm popup ─────────────────────────────────────────────────────────────

class ConfirmPopup(BasePopup):
    def __init__(self, tool: str, command: str):
        super().__init__(timeout_ms=60_000)
        self.tool    = tool
        self.command = command
        self._build()
        self._position()

    def _build(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        card = self._make_card(460)
        lay  = QVBoxLayout(card)
        lay.setContentsMargins(20, 18, 20, 16)
        lay.setSpacing(0)

        # header
        hdr = QHBoxLayout()
        warn = QLabel("⚠")
        warn.setStyleSheet(f"color:{C['amber']};font-size:18px;")
        hdr.addWidget(warn)
        hdr.addSpacing(8)
        title = QLabel("Destructive command")
        title.setObjectName("proj")
        hdr.addWidget(title)
        hdr.addStretch()

        close_btn = QPushButton("×")
        close_btn.setObjectName("close_btn")
        close_btn.setToolTip("Dismiss  (Esc)")
        close_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        close_btn.clicked.connect(self._dismiss)
        hdr.addWidget(close_btn)

        lay.addLayout(hdr)

        lay.addSpacing(4)
        sub = QLabel("Review before allowing")
        sub.setStyleSheet(f"color:{C['text2']};font-size:12px;")
        lay.addWidget(sub)

        lay.addSpacing(14)
        lay.addWidget(self._divider())
        lay.addSpacing(12)

        code_box = QWidget()
        code_box.setObjectName("code_box")
        cb_lay = QVBoxLayout(code_box)
        cb_lay.setContentsMargins(0, 0, 0, 0)
        cmd = QLabel(self.command[:1400])
        cmd.setObjectName("code")
        cmd.setWordWrap(True)
        cmd.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        cb_lay.addWidget(cmd)
        lay.addWidget(code_box)

        lay.addSpacing(14)

        row = QHBoxLayout()
        row.setSpacing(10)
        self._deny_btn  = SafeButton("✕  Deny")
        self._allow_btn = SafeButton("✓  Allow")
        for b, obj in [(self._deny_btn, "deny"), (self._allow_btn, "allow")]:
            b.setObjectName(obj)
            b.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._deny_btn.clicked.connect(self._dismiss)
        self._allow_btn.clicked.connect(lambda: self._choose("allow"))
        row.addWidget(self._deny_btn)
        row.addWidget(self._allow_btn)
        lay.addLayout(row)

        outer.addWidget(card)

    def keyPressEvent(self, e):
        k = e.key()
        if k == Qt.Key.Key_Escape:
            self._dismiss()
        elif k in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self._choose("allow")
        elif k in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            f = self.focusWidget()
            (self._deny_btn if f == self._allow_btn else self._allow_btn).setFocus()
        else:
            super().keyPressEvent(e)


# ── Entry point ───────────────────────────────────────────────────────────────

def _terminal_screen_position(width: int = 520, height: int = 640) -> tuple[int, int]:
    """Return (x, y) bottom-right of the screen containing the terminal window.

    Detection order:
      1. /tmp/claude-screen-<ZELLIJ_PANE_ID> written at claude startup (most reliable)
      2. Cursor position as fallback
    """
    def _position_for_screen(screen) -> tuple[int, int]:
        scr = screen.availableGeometry()
        x = scr.right()  - width  - 24
        y = scr.bottom() - height - 24
        y = max(y, scr.top() + 16)
        return x, y

    try:
        app = QApplication.instance() or QApplication(sys.argv[:1])

        # Read the screen recorded at claude startup (cursor was in terminal then)
        pane_id = os.environ.get("ZELLIJ_PANE_ID", "")
        if pane_id:
            screen_file = f"/tmp/claude-screen-{pane_id}"
            try:
                line = open(screen_file).read().strip()
                sx, sy, sw, sh = (int(v) for v in line.split(","))
                from PyQt6.QtCore import QPoint
                pt = QPoint(sx + sw // 2, sy + sh // 2)
                screen = QApplication.screenAt(pt) or QApplication.primaryScreen()
                return _position_for_screen(screen)
            except Exception:
                pass

        # Fallback: primary screen — safer than cursor which can be anywhere
        screen = QApplication.primaryScreen()
        return _position_for_screen(screen)
    except Exception:
        return 1360, 180  # reasonable fallback


def _web_stop(label: str, session_file: str) -> None:
    """Open a Cockpit web page for the session-stop beacon instead of PyQt6."""
    import urllib.request, urllib.error, time, json as _json

    COCKPIT = "http://localhost:3000"
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
            r = urllib.request.urlopen(f"{COCKPIT}/api/health", timeout=5)
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
        # Position window at bottom-right of the screen containing the terminal
        x, y = _terminal_screen_position(520, 640)
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

    def _create_session() -> str | None:
        data = _json.dumps({"project": label, "sessionContent": session_content}).encode()
        req  = urllib.request.Request(
            f"{COCKPIT}/api/beacon",
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
        url = f"{COCKPIT}/api/beacon/{session_id}"
        while time.time() < deadline:
            try:
                # 8s timeout: 3s was too tight for cold Next.js route compilation
                resp = urllib.request.urlopen(url, timeout=8)
                data = _json.loads(resp.read())
                if data.get("choice"):
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
            # Fall back to PyQt if Cockpit never started
            _pyqt_stop(label, session_file)
            return

    session_id = _create_session()
    if not session_id:
        _pyqt_stop(label, session_file)
        return

    _s = _load_settings()
    countdown = int(_s.get("countdown_seconds", _s.get("countdown_secs", COUNTDOWN_SECONDS)))
    _open_browser(f"{COCKPIT}/beacon/{session_id}?countdown={countdown}")

    choice = _poll_choice(session_id, time.time() + TIMEOUT_S)
    if choice:
        print(choice)
        sys.exit(0)
    sys.exit(1)


def _pyqt_stop(label: str, session_file: str) -> None:
    """Fallback: show the PyQt6 ContinuePopup when Cockpit is unavailable."""
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
        print(popup.result)
        sys.exit(0)
    sys.exit(1)


def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    os.environ.setdefault("DISPLAY", ":0")

    mode = sys.argv[1]
    if mode == "confirm":
        # Confirm popup must block synchronously — keep PyQt6 for this
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
    else:
        label = sys.argv[2]
        sf    = sys.argv[3] if len(sys.argv) > 3 else ""
        _web_stop(label, sf)


if __name__ == "__main__":
    main()
