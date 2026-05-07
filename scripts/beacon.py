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
    QPushButton, QLabel, QLineEdit, QGraphicsDropShadowEffect, QFrame,
)
from PyQt6.QtCore import Qt, QTimer, QThread, pyqtSignal
from PyQt6.QtGui import QColor, QCursor, QFont


# ── Whisper speech-to-text ────────────────────────────────────────────────────

class WhisperThread(QThread):
    transcribed = pyqtSignal(str)
    failed      = pyqtSignal(str)
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
            with sd.InputStream(samplerate=self.RATE, channels=1,
                                dtype="float32", callback=cb):
                while self._recording:
                    self.msleep(80)
            if not frames:
                return
            audio = np.concatenate(frames).flatten()
            out   = whisper.load_model(self._model_name).transcribe(audio, fp16=False)
            text  = out.get("text", "").strip()
            if text:
                self.transcribed.emit(text)
        except Exception as exc:
            self.failed.emit(str(exc))


# ── Palette ───────────────────────────────────────────────────────────────────

_THEME_PATH = os.path.expanduser("~/.config/agent-dashboard-theme.json")

def _load_theme() -> dict:
    default_theme = dict(
        card     = "#111111",
        surface  = "#1a1a1a",
        surface2 = "#222222",
        border   = "#2c2c2c",
        group_bg = "#0d0d0d",
        accent   = "#8b92ff",
        accent_d = "#151840",
        ship     = "#4ade80",
        ship_d   = "#0d2b1a",
        text1    = "#eaeaea",
        text2    = "#909090",
        text3    = "#555555",
        group_lbl= "#5c5c5c",
        green    = "#4ade80",
        green_d  = "#0d2b1a",
        amber    = "#fbbf24",
        amber_d  = "#2a1800",
        red      = "#f87171",
        red_d    = "#2d0f0f",
        cyan     = "#38bdf8",
        purple   = "#c084fc",
    )
    try:
        if os.path.exists(_THEME_PATH):
            loaded = json.load(open(_THEME_PATH))
            default_theme.update(loaded)
    except:
        pass
    return default_theme

C = _load_theme()

SS = """
/* ── Card ── */
QWidget#card {{
    background: {card};
    border-radius: 18px;
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
    border-radius: 10px;
    border: 1px solid {border};
}}
QLabel#sum_val {{
    color: {text1};
    font-size: 16px;
    line-height: 1.55;
}}
QLabel#sum_more {{
    color: {text1};
    font-size: 16px;
    line-height: 1.55;
}}
QPushButton#expand {{
    background: transparent;
    color: {text3};
    border: none;
    font-size: 12px;
    padding: 2px 0px;
    text-align: left;
}}
QPushButton#expand:hover {{ color: {text2}; }}

/* ── Action buttons — DEV group ── */
QPushButton#primary {{
    background: {accent_d};
    color: {accent};
    border: 1.5px solid {accent};
    border-radius: 9px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-align: left;
}}
QPushButton#primary:hover {{
    background: #232870;
    color: {text1};
    border-color: {text1};
}}
QPushButton#action {{
    background: {surface};
    color: {text2};
    border: 1px solid {border};
    border-radius: 9px;
    padding: 10px 14px;
    font-size: 13px;
    text-align: left;
}}
QPushButton#action:hover {{
    background: {surface2};
    color: {text1};
    border-color: {accent};
}}

/* ── Action buttons — SHIP group ── */
QPushButton#ship_primary {{
    background: {ship_d};
    color: {ship};
    border: 1.5px solid {ship};
    border-radius: 9px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-align: left;
}}
QPushButton#ship_primary:hover {{
    background: #163a22;
    color: {text1};
    border-color: {ship};
}}
QPushButton#ship_action {{
    background: {surface};
    color: {text2};
    border: 1px solid {border};
    border-radius: 9px;
    padding: 10px 14px;
    font-size: 13px;
    text-align: left;
}}
QPushButton#ship_action:hover {{
    background: {surface2};
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
    selection-background-color: {accent_d};
}}
QLineEdit#custom:focus {{
    border-color: {accent};
    background: #131830;
}}

/* ── Confirm popup ── */
QWidget#code_box {{
    background: #080b18;
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
QPushButton#allow:hover {{ background: #163322; }}
QPushButton#deny {{
    background: {red_d};
    color: {red};
    border: 1.5px solid {red};
    border-radius: 10px;
    padding: 11px 16px;
    font-size: 13px;
    font-weight: 700;
}}
QPushButton#deny:hover {{ background: #3d1212; }}
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

class SafeButton(QPushButton):
    def keyPressEvent(self, e):
        if e.key() == Qt.Key.Key_Space:
            e.ignore()
        else:
            super().keyPressEvent(e)

class FocusCancelInput(QLineEdit):
    def __init__(self, on_focus):
        super().__init__()
        self._on_focus = on_focus
    def focusInEvent(self, e):
        self._on_focus()
        # Grab OS-level focus so keyboard input reaches this field.
        # WindowDoesNotAcceptFocus only blocks automatic focus on show;
        # an explicit activateWindow() after a deliberate click is fine.
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
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet(SS)
        self._dismiss_timer = QTimer(singleShot=True)
        self._dismiss_timer.timeout.connect(self._dismiss)
        self._dismiss_timer.start(timeout_ms)

    def _pause_dismiss(self):
        self._dismiss_timer.stop()

    def _resume_dismiss(self, ms=60_000):
        self._dismiss_timer.start(ms)

    def _make_card(self, width=440):
        card = QWidget()
        card.setObjectName("card")
        sh = QGraphicsDropShadowEffect()
        sh.setBlurRadius(70)
        sh.setOffset(0, 20)
        sh.setColor(QColor(0, 0, 0, 230))
        card.setGraphicsEffect(sh)
        card.setFixedWidth(width)
        return card

    def _divider(self):
        d = QLabel()
        d.setObjectName("divider")
        return d

    def _position(self):
        scr = QApplication.primaryScreen().availableGeometry()
        self.adjustSize()
        self.move(
            scr.right()  - self.sizeHint().width()  - 24,
            scr.bottom() - self.sizeHint().height() - 24,
        )

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

    def _start_countdown(self):
        self._timer = QTimer(interval=1000)
        self._timer.timeout.connect(self._tick)
        self._timer.start()

    def _tick(self):
        # If user has started typing, cancel the countdown instead of auto-submitting
        if self._custom_input and self._custom_input.text().strip():
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
        # If user is composing a custom prompt, don't auto-choose an action
        if not key.startswith("custom:") and self._custom_input and self._custom_input.text().strip():
            self._cancel_countdown()
            return
        if self._timer and self._timer.isActive():
            self._timer.stop()
        super()._choose(key)

    def _dismiss(self):
        # Never auto-dismiss while the user is composing a custom prompt
        if self._custom_input and self._custom_input.text().strip():
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
        box_lay.setContentsMargins(16, 14, 16, 14)
        box_lay.setSpacing(12)

        # ── Health strip — only show when there's something worth flagging ──
        def _strip_notable(k, v):
            if k == 'tests'  and v.lower() in ('no suite', 'no tests', 'n/a', ''):
                return False
            if k == 'todos'  and v.strip().startswith('0'):
                return False
            if k == 'health' and v.lower().startswith(('good', 'excellent')):
                return False
            return True
        meta_keys = [k for k in ('tests', 'todos', 'health')
                     if k in parsed and _strip_notable(k, parsed[k])]
        if meta_keys:
            health_val = parsed.get('health', '').lower()
            h_color = (C['green']  if health_val in ('good', 'excellent')
                  else C['red']    if health_val == 'critical'
                  else C['amber'])
            strip = QHBoxLayout()
            strip.setSpacing(16)
            strip.addStretch()
            for mk in meta_keys:
                icon = {'tests': '🧪', 'todos': '📝', 'health': '❤️'}[mk]
                color = h_color if mk == 'health' else C['text2']
                lbl = QLabel(f"{icon}  {parsed[mk]}")
                lbl.setStyleSheet(
                    f"color:{color};font-size:12px;font-weight:600;")
                strip.addWidget(lbl)
            strip.addStretch()
            box_lay.addLayout(strip)

            if any(k in parsed for k in ('done', 'next', 'in_progress')):
                div = QFrame()
                div.setStyleSheet(f"background:{C['border']};max-height:1px;min-height:1px;")
                box_lay.addWidget(div)

        # ── Narrative rows — UP NEXT first (actionable), DONE last (context) ──
        PREVIEW = 200
        narrative = [
            (C['cyan'],  "UP NEXT",     'next',        True),
            (C['amber'], "IN PROGRESS", 'in_progress', True),
            (C['green'], "DONE",        'done',         False),
        ]
        has_narrative = any(k in parsed for _, _, k, _ in narrative)
        if not has_narrative and not meta_keys:
            v = QLabel(self.session)
            v.setObjectName("sum_val")
            v.setWordWrap(True)
            v.setMaximumWidth(480)
            box_lay.addWidget(v)

        for color, label, key, prominent in narrative:
            if key not in parsed:
                continue
            val_text = parsed[key]
            row = QVBoxLayout()
            row.setSpacing(4)

            k_lbl = QLabel(label)
            k_lbl.setStyleSheet(
                f"color:{color};font-size:12px;font-weight:700;letter-spacing:1.0px;")
            row.addWidget(k_lbl)

            is_long = len(val_text) > PREVIEW
            v_lbl   = QLabel(val_text[:PREVIEW] + ("…" if is_long else ""))
            v_lbl.setObjectName("sum_val")
            v_lbl.setWordWrap(True)
            v_lbl.setMaximumWidth(480)
            if not prominent:
                v_lbl.setStyleSheet(f"color:{C['text2']};font-size:14px;line-height:1.5;")
            row.addWidget(v_lbl)

            if is_long:
                full = QLabel(val_text)
                full.setObjectName("sum_more")
                full.setWordWrap(True)
                full.setMaximumWidth(480)
                if not prominent:
                    full.setStyleSheet(f"color:{C['text2']};font-size:14px;line-height:1.5;")
                full.setVisible(False)
                tog = SafeButton("▸ show more")
                tog.setObjectName("expand")
                tog.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
                tog.pressed.connect(self._cancel_countdown)
                def _flip(b=tog, s=v_lbl, f=full):
                    expanded = f.isVisible()
                    s.setVisible(expanded)
                    f.setVisible(not expanded)
                    b.setText("▾ show less" if not expanded else "▸ show more")
                    self.adjustSize()
                    self._position()
                tog.clicked.connect(_flip)
                row.addWidget(tog)
                row.addWidget(full)

            box_lay.addLayout(row)

        lay.addWidget(box)

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
        self._set_mic_status(f"Recording  ·  click 🎤 again to stop", C['red'])
        self._rec_timer = QTimer(interval=1000)
        self._rec_timer.timeout.connect(self._rec_tick)
        self._rec_timer.start()
        self._whisper = WhisperThread(model=self._whisper_model)
        self._whisper.transcribed.connect(self._on_transcribed)
        self._whisper.failed.connect(self._on_transcribe_error)
        self._whisper.finished.connect(self._on_thread_finished)
        self._whisper.start()

    def _rec_tick(self):
        self._rec_secs += 1
        self._apply_mic("recording", f"● {self._rec_secs}s")

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
        outer.setContentsMargins(16, 16, 16, 16)

        card = self._make_card(540)
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

        self._custom_input = FocusCancelInput(self._cancel_countdown)
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
                r = urllib.request.urlopen("http://localhost:3000/api/control", timeout=1)
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

        # Not running — start it, poll until /api/control responds, then open browser
        subprocess.Popen(
            ["bash", "-lc", "cd ~/dev/cockpit && npm run dev"],
            env=env, start_new_session=True,
        )
        self._cockpit_poll(0, url, env, _launch_browser)

    def _cockpit_poll(self, attempt, url, env, launch_browser):
        import urllib.request
        if attempt > 20:   # give up after 40s — never open a broken URL
            return
        try:
            r = urllib.request.urlopen("http://localhost:3000/api/control", timeout=1)
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
        outer.setContentsMargins(16, 16, 16, 16)

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

def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    os.environ.setdefault("DISPLAY", ":0")
    app = QApplication(sys.argv)
    app.setApplicationName("Beacon")

    mode = sys.argv[1]
    if mode == "confirm":
        tool    = sys.argv[2]
        cf      = sys.argv[3] if len(sys.argv) > 3 else ""
        command = open(cf).read().strip() if cf and os.path.exists(cf) else ""
        popup   = ConfirmPopup(tool, command)
    else:
        label   = sys.argv[2]
        sf      = sys.argv[3] if len(sys.argv) > 3 else ""
        popup   = ContinuePopup(mode, label, sf)

    popup.show()
    popup.raise_()
    popup.activateWindow()  # needed on X11 to raise above other windows
    # Re-run position after the event loop has laid out widgets (word-wrap heights settle)
    QTimer.singleShot(0, popup._position)
    app.exec()

    if popup.result:
        print(popup.result)
        sys.exit(0)
    sys.exit(1)


if __name__ == "__main__":
    main()
