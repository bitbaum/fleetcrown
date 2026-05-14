"""Beacon — Qt widget classes: stylesheet, helpers, BasePopup, ContinuePopup, ConfirmPopup."""
import os, json, subprocess, sys, shutil, re
from pathlib import Path

# Ensure vendor packages are on the path before importing PyQt6.
_v = Path(__file__).resolve().parent.parent / ".python-vendor" / "site-packages"
if _v.exists():
    sys.path.insert(0, str(_v))

from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QPlainTextEdit, QFrame,
    QScrollArea,
)
from PyQt6.QtCore import Qt, QTimer, QPoint
from PyQt6.QtGui import QColor, QCursor, QPalette

from _beacon_theme import load_theme
from _beacon_config import (
    COUNTDOWN_SECONDS, CUSTOM_CHOICE_PREFIX, COCKPIT_URL,
    load_settings, load_prompt_meta,
)
from _beacon_audio import WhisperThread

SWITCH_CHOICE_PREFIX = "switch:"
AGENT_FALLBACK_ORDER = ["claude", "codex", "gemini"]


def _agent_label(agent: str) -> str:
    return {"claude": "Claude", "codex": "Codex", "gemini": "Gemini"}.get(agent, "agent")


def _looks_like_capacity_issue(text: str) -> bool:
    return bool(re.search(
        r"rate\s*limit|quota|credit|usage\s*limit|token\s*limit|out\s+of\s+tokens|"
        r"context\s*(window|length|limit)|maximum\s+context|insufficient\s+quota",
        text or "",
        re.IGNORECASE,
    ))


def _next_available_agent(current: str) -> str | None:
    available = [agent for agent in AGENT_FALLBACK_ORDER if shutil.which(agent)]
    if current in AGENT_FALLBACK_ORDER:
        for agent in AGENT_FALLBACK_ORDER[AGENT_FALLBACK_ORDER.index(current) + 1:]:
            if agent in available:
                return agent
    for agent in AGENT_FALLBACK_ORDER:
        if agent != current and agent in available:
            return agent
    return None

# Build color dict + stylesheet once at import time.
C = load_theme()
_COPY_PATH = Path(__file__).resolve().parent.parent / "src" / "config" / "session-handoff-copy.json"
try:
    HANDOFF_COPY = json.loads(_COPY_PATH.read_text(encoding="utf-8"))
except Exception:
    HANDOFF_COPY = {
        "title": "Latest agent handoff",
        "next": "Next",
        "inProgress": "In progress",
        "completed": "Completed",
        "facts": "Agent-reported run facts",
        "factLabels": {"tests": "Tests", "todos": "Todos", "health": "Health"},
    }

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

/* ── Custom input (QPlainTextEdit) ── */
QPlainTextEdit#custom {{
    background: {surface};
    color: {text1};
    border: 1.5px solid {border};
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
    selection-background-color: {surface2};
}}
QPlainTextEdit#custom:focus {{
    border-color: {text3};
    background: {surface2};
}}

/* ── Queue section ── */
QWidget#queue_card {{
    background: {surface};
    border: 1px solid {border};
    border-radius: 10px;
}}
QPushButton#queue_send {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 4px;
    font-size: 13px;
    min-width: 24px; max-width: 24px;
    min-height: 24px; max-height: 24px;
    padding: 0;
}}
QPushButton#queue_send:hover {{ color: {label_next}; }}
QPushButton#queue_remove {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 4px;
    font-size: 13px;
    min-width: 24px; max-width: 24px;
    min-height: 24px; max-height: 24px;
    padding: 0;
}}
QPushButton#queue_remove:hover {{ color: {red}; }}

/* ── Status line / pause-play ── */
QLabel#status_line {{
    color: {text3};
    font-size: 11px;
    background: transparent;
}}
QLabel#kicker {{
    color: {text3};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    background: transparent;
}}
QPushButton#pause_btn {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 4px;
    font-size: 13px;
    min-width: 28px; max-width: 28px;
    min-height: 28px; max-height: 28px;
    padding: 0;
}}
QPushButton#pause_btn:hover {{ color: {text2}; }}

/* ── Send / enqueue buttons ── */
QPushButton#send_btn {{
    background: {btn_primary_bg};
    color: {btn_primary_fg};
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    min-width: 42px; max-width: 42px;
    min-height: 42px; max-height: 42px;
    padding: 0;
}}
QPushButton#send_btn:hover {{ background: {btn_primary_hover}; }}
QPushButton#enqueue_btn {{
    background: {surface};
    color: {text3};
    border: 1px solid {border};
    border-radius: 8px;
    font-size: 14px;
    min-width: 42px; max-width: 42px;
    min-height: 36px; max-height: 36px;
    padding: 0;
}}
QPushButton#enqueue_btn:hover {{
    color: {text2};
    border-color: {text3};
}}
QPushButton#dismiss_hint {{
    background: transparent;
    color: {text3};
    border: none;
    border-radius: 8px;
    padding: 6px;
    font-size: 11px;
    text-align: center;
}}
QPushButton#dismiss_hint:hover {{ color: {text2}; }}

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


# ── Screen positioning ─────────────────────────────────────────────────────────

def terminal_screen_position(width: int = 520, height: int = 640) -> tuple[int, int]:
    """Return (x, y) bottom-right of the screen containing the terminal window.

    Detection order:
      1. /tmp/claude-screen-<ZELLIJ_PANE_ID> written at claude startup (most reliable)
      2. Primary screen as fallback
    """
    def _position_for_screen(screen) -> tuple[int, int]:
        scr = screen.availableGeometry()
        x = scr.right()  - width  - 24
        y = scr.bottom() - height - 24
        y = max(y, scr.top() + 16)
        return x, y

    try:
        app = QApplication.instance() or QApplication(sys.argv[:1])

        pane_id = os.environ.get("ZELLIJ_PANE_ID", "")
        if pane_id:
            try:
                line = open(f"/tmp/claude-screen-{pane_id}").read().strip()
                sx, sy, sw, sh = (int(v) for v in line.split(","))
                pt = QPoint(sx + sw // 2, sy + sh // 2)
                screen = QApplication.screenAt(pt) or QApplication.primaryScreen()
                return _position_for_screen(screen)
            except Exception:
                pass

        screen = QApplication.primaryScreen()
        return _position_for_screen(screen)
    except Exception:
        return 1360, 180  # reasonable fallback


# ── Widget helpers ─────────────────────────────────────────────────────────────

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


class FocusCancelTextEdit(QPlainTextEdit):
    """Multi-line text edit that cancels countdown on click/focus.

    Key bindings:
      Enter         → send  (calls window._submit_custom)
      Alt+Enter     → enqueue  (calls window._enqueue_custom)
      Shift+Enter   → literal newline
      Escape        → dismiss popup
    """
    def __init__(self, on_focus, on_engage=None):
        super().__init__()
        self._on_focus  = on_focus
        self._on_engage = on_engage
        self.setAcceptRichText(False)

    def mousePressEvent(self, e):
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

    def keyPressEvent(self, e):
        key  = e.key()
        mods = e.modifiers()
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if mods & Qt.KeyboardModifier.ShiftModifier:
                super().keyPressEvent(e)   # insert newline
            elif mods & Qt.KeyboardModifier.AltModifier:
                w = self.window()
                if hasattr(w, "_enqueue_custom"):
                    w._enqueue_custom()
            else:
                w = self.window()
                if hasattr(w, "_submit_custom"):
                    w._submit_custom()
        elif key == Qt.Key.Key_Escape:
            w = self.window()
            if hasattr(w, "_dismiss"):
                w._dismiss()
        else:
            super().keyPressEvent(e)


# ── Base popup ─────────────────────────────────────────────────────────────────

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
        self.adjustSize()
        w, h = self.sizeHint().width(), self.sizeHint().height()
        x, y = terminal_screen_position(w, h)
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


# ── Continue popup ─────────────────────────────────────────────────────────────

class ContinuePopup(BasePopup):

    WHISPER_MODELS = ["tiny", "base", "small", "medium"]

    def __init__(self, mode: str, label: str, session_file: str = ""):
        super().__init__(timeout_ms=35_000)
        self.mode  = mode
        self.label = label
        self._tab  = label   # tab name == label — used for queue file path
        _s    = load_settings()
        _meta = load_prompt_meta()
        self._secs = int(_s.get("countdown_seconds", _s.get("countdown_secs", COUNTDOWN_SECONDS)))
        # Build action lists from SSOT meta — matches web beacon primary/action/more distinction
        self.PRIMARY_ACTIONS = [(str(m["slot"]), m["icon"], m["label"])
                                for m in _meta if m.get("style") == "primary"]
        self.ACTIONS      = [(str(m["slot"]), m["icon"], m["label"])
                             for m in _meta if m.get("style") == "action"]
        self.MORE_ACTIONS = [(str(m["slot"]), m["icon"], m["label"])
                             for m in _meta if m.get("style") == "more"]
        # Legacy fallback: old format used "primary"/"action" combined in ACTIONS
        if not self.PRIMARY_ACTIONS and not self.ACTIONS:
            combined = [(str(m["slot"]), m["icon"], m["label"], m.get("style","action"))
                        for m in _meta if m.get("style") in ("primary","action")]
            self.PRIMARY_ACTIONS = [(k,i,l) for k,i,l,s in combined if s == "primary"]
            self.ACTIONS         = [(k,i,l) for k,i,l,s in combined if s == "action"]
        self._timer           = None
        self._status_label    = None
        self._pause_btn       = None
        self._queue_kicker    = None
        self._custom_input    = None   # FocusCancelTextEdit (QPlainTextEdit)
        self._mic_btn         = None
        self._mic_status      = None
        self._model_btn       = None
        self._whisper         = None
        self._mic_state       = "idle"
        self._input_engaged   = False
        self._whisper_model   = _s.get("whisper_model", "base")
        self._rec_secs        = 0
        self._auto_secs       = 0
        self._auto_timer      = QTimer()
        self._action_btns     = []   # all prompt buttons for keyboard nav
        self._primary_btns    = []
        self._switch_btn      = None
        self._current_agent   = os.environ.get("AGENT_CURRENT_AGENT", "claude").strip().lower()
        if self._current_agent not in AGENT_FALLBACK_ORDER:
            self._current_agent = "claude"
        self._capacity_issue  = False
        self._next_agent      = None
        # Start paused if the web app wrote the sentinel while Cockpit was running.
        _pause_file = f"/tmp/cockpit-auto-continue-{label.lower()}"
        self._auto_continue   = not os.path.exists(_pause_file)
        self._queue           = []     # in-memory queue (synced from /tmp file)
        self._queue_prev      = None   # last polled snapshot for change detection
        self._queue_container = None   # QWidget shown/hidden based on queue size
        self._queue_items_lay = None   # QVBoxLayout rebuilt on every queue change
        self._queue_timer     = None
        self.session          = ""
        if session_file and os.path.exists(session_file):
            try:
                self.session = open(session_file).read().strip()
            except OSError:
                pass
        self._capacity_issue = _looks_like_capacity_issue(self.session)
        self._next_agent = _next_available_agent(self._current_agent)
        self._build()
        self._load_queue()
        self._start_queue_poll()
        self._position()
        self._update_pause_btn()
        if mode == "stop" and self._auto_continue:
            self._start_countdown()

    # ── Queue ──────────────────────────────────────────────────────────────────

    def _queue_file(self) -> str:
        return f"/tmp/agent-queue-{self._tab.lower()}"

    def _load_queue(self):
        try:
            p = self._queue_file()
            if os.path.exists(p):
                data = json.load(open(p))
                q = [str(x) for x in data if x] if isinstance(data, list) else []
            else:
                q = []
        except Exception:
            q = []
        if q != self._queue_prev:
            self._queue      = q
            self._queue_prev = list(q)
            self._refresh_queue_ui()
            self._update_primary_btn_text()
            self._update_status_label()

    def _save_queue(self):
        try:
            p   = self._queue_file()
            tmp = p + ".pyqt-tmp"
            with open(tmp, "w") as f:
                json.dump(self._queue, f)
            os.rename(tmp, p)
        except Exception:
            pass

    def _start_queue_poll(self):
        self._queue_timer = QTimer(interval=1500)
        self._queue_timer.timeout.connect(self._load_queue)
        self._queue_timer.start()

    def _refresh_queue_ui(self):
        if self._queue_container is None or self._queue_items_lay is None:
            return
        if self._queue_kicker:
            self._queue_kicker.setText(f"QUEUE  ·  {len(self._queue)}")
        # Clear existing item rows
        while self._queue_items_lay.count():
            item = self._queue_items_lay.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        # Rebuild rows
        for i, text in enumerate(self._queue):
            row_w = QWidget()
            row   = QHBoxLayout(row_w)
            row.setContentsMargins(14, 5, 10, 5)
            row.setSpacing(6)

            num = QLabel(str(i + 1))
            num.setStyleSheet(
                f"color:{C['label_next'] if i==0 else C['text3']};"
                f"font-size:10px;font-weight:700;background:transparent;")
            num.setFixedWidth(14)
            row.addWidget(num)

            truncated = text if len(text) <= 55 else text[:53] + "…"
            txt = QLabel(truncated)
            txt.setStyleSheet(
                f"color:{C['text1'] if i==0 else C['text3']};"
                f"font-size:13px;background:transparent;")
            txt.setToolTip(text)
            row.addWidget(txt, 1)

            send_btn = SafeButton("→")
            send_btn.setObjectName("queue_send")
            send_btn.setToolTip("Send now")
            send_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            send_btn.clicked.connect(lambda _, idx=i: self._send_from_queue(idx))
            row.addWidget(send_btn)

            rm_btn = SafeButton("×")
            rm_btn.setObjectName("queue_remove")
            rm_btn.setToolTip("Remove from queue")
            rm_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            rm_btn.clicked.connect(lambda _, idx=i: self._remove_from_queue(idx))
            row.addWidget(rm_btn)

            self._queue_items_lay.addWidget(row_w)

        visible = bool(self._queue)
        self._queue_container.setVisible(visible)
        if self.isVisible():
            self.adjustSize()
            self._position()

    def _send_from_queue(self, idx: int):
        if idx < len(self._queue):
            item = self._queue.pop(idx)
            self._save_queue()
            self._queue_prev = list(self._queue)
            self._refresh_queue_ui()
            self._update_status_label()
            self._choose(f"{CUSTOM_CHOICE_PREFIX}{item}")

    def _remove_from_queue(self, idx: int):
        if idx < len(self._queue):
            self._queue.pop(idx)
            self._save_queue()
            self._queue_prev = list(self._queue)
            self._refresh_queue_ui()
            self._update_status_label()

    def _enqueue_custom(self):
        text = self._custom_input_text().strip()
        if not text:
            return
        self._queue.append(text)
        self._save_queue()
        self._queue_prev = list(self._queue)
        if self._custom_input:
            self._custom_input.clear()
        self._refresh_queue_ui()
        self._update_status_label()

    # ── Countdown ──────────────────────────────────────────────────────────────

    def _cancel_countdown(self):
        if self._timer and self._timer.isActive():
            self._timer.stop()
        self._pause_dismiss()
        self._update_primary_btn_text()
        self._update_status_label()

    def _engage_input(self):
        """Strip WindowDoesNotAcceptFocus so keyboard events route here after click."""
        self._input_engaged = True
        self._cancel_countdown()
        flags = self.windowFlags()
        if flags & Qt.WindowType.WindowDoesNotAcceptFocus:
            self.setWindowFlags(flags & ~Qt.WindowType.WindowDoesNotAcceptFocus)
            self.show()
        self.activateWindow()
        self.raise_()
        if self._custom_input:
            self._custom_input.setFocus(Qt.FocusReason.MouseFocusReason)

    def _start_countdown(self):
        self._timer = QTimer(interval=1000)
        self._timer.timeout.connect(self._tick)
        self._timer.start()

    def _tick(self):
        if self._input_engaged or self._custom_input_text().strip():
            self._cancel_countdown()
            return
        self._secs -= 1
        if self._secs <= 0:
            self._timer.stop()
            # Capacity exhaustion means the current CLI cannot continue; switch first.
            if self._capacity_issue and self._next_agent:
                self._choose(f"{SWITCH_CHOICE_PREFIX}{self._next_agent}")
            elif self._queue:
                item = self._queue.pop(0)
                self._save_queue()
                self._queue_prev = list(self._queue)
                self._refresh_queue_ui()
                self._choose(f"{CUSTOM_CHOICE_PREFIX}{item}")
            else:
                self._choose("1")
        else:
            self._update_primary_btn_text()
            self._update_status_label()

    def _choose(self, key):
        if (
            not key.startswith(CUSTOM_CHOICE_PREFIX)
            and not key.startswith(SWITCH_CHOICE_PREFIX)
            and self._custom_input_text().strip()
        ):
            self._cancel_countdown()
            return
        if self._timer and self._timer.isActive():
            self._timer.stop()
        if self._queue_timer and self._queue_timer.isActive():
            self._queue_timer.stop()
        super()._choose(key)

    def _dismiss(self):
        if self._input_engaged or self._custom_input_text().strip():
            self._pause_dismiss()
            return
        if self._timer and self._timer.isActive():
            self._timer.stop()
        if self._queue_timer and self._queue_timer.isActive():
            self._queue_timer.stop()
        super()._dismiss()

    # ── Pause / play ───────────────────────────────────────────────────────────

    def _toggle_pause(self):
        self._auto_continue = not self._auto_continue
        if self._auto_continue:
            if self.mode == "stop" and self._secs > 0:
                self._start_countdown()
            self._resume_dismiss(max(self._secs * 1000 + 5000, 60_000))
        else:
            if self._timer and self._timer.isActive():
                self._timer.stop()
            self._pause_dismiss()
        self._update_primary_btn_text()
        self._update_status_label()
        self._update_pause_btn()

    def _update_pause_btn(self):
        if self._pause_btn:
            self._pause_btn.setText("▶" if not self._auto_continue else "⏸")
            self._pause_btn.setToolTip(
                "Resume auto-continue" if not self._auto_continue else "Pause auto-continue")

    # ── UI text updates ────────────────────────────────────────────────────────

    def _custom_input_text(self) -> str:
        return self._custom_input.toPlainText() if self._custom_input else ""

    def _update_primary_btn_text(self):
        for i, (key, icon, lbl_text) in enumerate(self.PRIMARY_ACTIONS):
            if i >= len(self._primary_btns):
                break
            btn = self._primary_btns[i]
            if key == "1":
                if not self._auto_continue:
                    suffix = "   ⏸"
                elif self._secs > 0:
                    suffix = f"   ⚡ {self._secs}s"
                else:
                    suffix = ""
            else:
                suffix = ""
            btn.setText(f"  {icon}   {lbl_text}{suffix}")

    def _update_status_label(self):
        if not self._status_label:
            return
        custom = self._custom_input_text().strip()
        if custom:
            self._status_label.setText("Enter to send  ·  Alt+Enter to queue")
        elif not self._auto_continue:
            self._status_label.setText("Auto-continue paused")
        elif self._secs <= 0:
            self._status_label.setText("Dispatching…")
        elif self._capacity_issue and self._next_agent:
            self._status_label.setText(
                f"Switching to {_agent_label(self._next_agent)} in {self._secs}s")
        elif self._queue:
            preview = self._queue[0]
            if len(preview) > 40:
                preview = preview[:38] + "…"
            extra = f"  ·  +{len(self._queue)-1} more" if len(self._queue) > 1 else ""
            self._status_label.setText(f'→ "{preview}" in {self._secs}s{extra}')
        else:
            self._status_label.setText(f"AI continues based on plan in {self._secs}s")

    # ── Session summary ────────────────────────────────────────────────────────

    def _build_summary(self, lay):
        # Python port of parseSessionFile() in src/lib/session-content.ts.
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

        W = 548

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

        has_structured_summary = any(k in parsed for k in ('next', 'in_progress', 'done', 'tests', 'todos', 'health'))
        if has_structured_summary:
            box_lay.addWidget(_section_label(HANDOFF_COPY["title"].upper(), C['label_next']))
            box_lay.addSpacing(6)

        if 'next' in parsed:
            box_lay.addWidget(_section_label(HANDOFF_COPY["next"].upper(), C['label_next']))
            box_lay.addSpacing(4)
            for itm in [s.strip() for s in parsed['next'].split('; ') if s.strip()]:
                box_lay.addLayout(_make_bullet(itm, "→", C['label_next']))

        if 'in_progress' in parsed:
            if 'next' in parsed:
                box_lay.addSpacing(8)
            box_lay.addWidget(_section_label(HANDOFF_COPY["inProgress"].upper(), C['label_progress']))
            box_lay.addSpacing(4)
            for itm in [s.strip() for s in parsed['in_progress'].split('; ') if s.strip()]:
                box_lay.addLayout(_make_bullet(itm, "◉", C['label_progress']))

        if 'done' in parsed:
            done_items = [s.strip() for s in parsed['done'].split('; ') if s.strip()]
            if 'next' in parsed or 'in_progress' in parsed:
                box_lay.addSpacing(10)

            done_row = QHBoxLayout()
            done_row.setSpacing(6)
            done_lbl = QLabel(f"{HANDOFF_COPY['completed'].upper()}  ·  {len(done_items)}")
            done_lbl.setStyleSheet(
                f"color:{C['text3']};font-size:10px;font-weight:700;letter-spacing:1.2px;background:transparent;")
            done_row.addWidget(done_lbl)
            done_row.addStretch()

            toggle_btn = QPushButton("▸")
            toggle_btn.setStyleSheet(
                f"background:transparent;color:{C['text3']};border:none;"
                f"font-size:13px;padding:1px 6px;")
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
                if not vis:
                    QTimer.singleShot(50, lambda: scr_area.verticalScrollBar().setValue(
                        scr_area.verticalScrollBar().maximum()))

            toggle_btn.clicked.connect(_toggle_done)
            box_lay.addWidget(done_body)

        facts = []
        fact_labels = HANDOFF_COPY.get("factLabels", {})
        for key, fallback in (('tests', 'Tests'), ('todos', 'Todos'), ('health', 'Health')):
            if key in parsed and str(parsed[key]).strip():
                label = fact_labels.get(key, fallback)
                facts.append(f"{label}: {parsed[key].strip()}")

        if facts:
            if any(k in parsed for k in ('next', 'in_progress', 'done')):
                box_lay.addSpacing(10)
            box_lay.addWidget(_section_label(HANDOFF_COPY["facts"].upper(), C['text3']))
            box_lay.addSpacing(4)
            for fact in facts:
                lbl = QLabel(fact)
                lbl.setWordWrap(True)
                lbl.setMaximumWidth(W)
                lbl.setStyleSheet(
                    f"color:{C['text3']};font-size:12px;line-height:18px;"
                    f"background:{C['input_bg']};border:1px solid {C['border']};"
                    f"border-radius:8px;padding:7px 9px;")
                lbl.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
                box_lay.addWidget(lbl)

        if not has_structured_summary:
            v = QLabel(self.session)
            v.setWordWrap(True)
            v.setMaximumWidth(W)
            v.setStyleSheet(f"color:{C['text1']};font-size:15px;background:transparent;")
            v.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            box_lay.addWidget(v)

        box_lay.addStretch()

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

    # ── Mic / Whisper ──────────────────────────────────────────────────────────

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
        bars = min(8, int(self._rec_peak * 40))
        level_str = "▮" * bars + "▯" * (8 - bars)
        self._apply_mic("recording", f"● {self._rec_secs}s")
        if self._mic_status:
            self._set_mic_status(
                f"Recording  ·  {level_str}  ·  click 🎤 to stop",
                C['red'] if self._rec_peak > 0.003 else C['amber'],
            )
        self._rec_peak = 0.0

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
            cur = self._custom_input.toPlainText().strip()
            self._custom_input.setPlainText((cur + " " + text).strip() if cur else text)
            cursor = self._custom_input.textCursor()
            cursor.movePosition(cursor.MoveOperation.End)
            self._custom_input.setTextCursor(cursor)
            self._custom_input.setFocus()
        self._auto_secs = 5
        self._set_mic_status(f"✓  Sending in {self._auto_secs}s  ·  edit to pause", C['green'])
        self._auto_timer = QTimer(interval=1000)
        self._auto_timer.timeout.connect(self._auto_tick)
        self._auto_timer.start()
        if self._custom_input:
            self._custom_input.textChanged.connect(self._cancel_auto_submit)

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

    # ── Build ──────────────────────────────────────────────────────────────────

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

        hdr_left = QVBoxLayout()
        hdr_left.setSpacing(2)
        kicker = QLabel("SESSION COMPLETE")
        kicker.setObjectName("kicker")
        hdr_left.addWidget(kicker)
        proj = QLabel(self.label)
        proj.setObjectName("proj")
        hdr_left.addWidget(proj)
        hdr.addLayout(hdr_left)
        hdr.addStretch()

        dash_btn = QPushButton("⊞ Cockpit")
        dash_btn.setObjectName("dash")
        dash_btn.setToolTip(f"Open Cockpit control panel ({COCKPIT_URL}/control)")
        dash_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        dash_btn.clicked.connect(self._open_cockpit)
        hdr.addWidget(dash_btn)

        badge = QLabel("● done")
        badge.setStyleSheet(
            f"color:{C['green']};font-size:11px;font-weight:700;"
            f"padding:3px 10px;background:{C['surface']};border-radius:10px;"
            f"border:1px solid {C['green']}44;")
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
            lay.addSpacing(10)

        # ── Queue section (shown/hidden dynamically) ──
        self._queue_container = QWidget()
        self._queue_container.setObjectName("queue_card")
        q_outer = QVBoxLayout(self._queue_container)
        q_outer.setContentsMargins(0, 0, 0, 0)
        q_outer.setSpacing(0)

        q_header = QHBoxLayout()
        q_header.setContentsMargins(14, 10, 14, 8)
        self._queue_kicker = QLabel("QUEUE  ·  0")
        self._queue_kicker.setObjectName("group_label")
        q_header.addWidget(self._queue_kicker)
        q_header.addStretch()
        q_outer.addLayout(q_header)

        self._queue_items_lay = QVBoxLayout()
        self._queue_items_lay.setContentsMargins(0, 0, 0, 0)
        self._queue_items_lay.setSpacing(0)
        q_outer.addLayout(self._queue_items_lay)
        q_outer.addSpacing(6)

        self._queue_container.setVisible(False)
        lay.addWidget(self._queue_container)
        lay.addSpacing(6)

        # ── Agent fallback switch ──
        if self._next_agent:
            switch_hint = QLabel(
                f"{_agent_label(self._current_agent)} → {_agent_label(self._next_agent)}"
                + ("  ·  capacity issue" if self._capacity_issue else "  ·  fallback ready")
            )
            switch_hint.setObjectName("status_line")
            lay.addWidget(switch_hint)
            lay.addSpacing(3)

            self._switch_btn = SafeButton(f"  ↔   Switch to {_agent_label(self._next_agent)} and continue")
            self._switch_btn.setObjectName("ship_primary" if self._capacity_issue else "action")
            self._switch_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            self._switch_btn.clicked.connect(lambda _, a=self._next_agent: self._choose(f"{SWITCH_CHOICE_PREFIX}{a}"))
            self._switch_btn.pressed.connect(self._cancel_countdown)
            lay.addWidget(self._switch_btn)
            lay.addSpacing(8)
            self._action_btns.append(self._switch_btn)

        # ── Primary action button ──
        for key, icon, lbl_text in self.PRIMARY_ACTIONS:
            btn = SafeButton(f"  {icon}   {lbl_text}")
            btn.setObjectName("primary")
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.clicked.connect(lambda _, k=key: self._choose(k))
            btn.pressed.connect(self._cancel_countdown)
            lay.addWidget(btn)
            lay.addSpacing(3)
            self._primary_btns.append(btn)
            self._action_btns.append(btn)

        # ── Action buttons ──
        for key, icon, lbl_text in self.ACTIONS:
            btn = SafeButton(f"  {icon}   {lbl_text}")
            btn.setObjectName("action")
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.clicked.connect(lambda _, k=key: self._choose(k))
            btn.pressed.connect(self._cancel_countdown)
            lay.addWidget(btn)
            lay.addSpacing(3)
            self._action_btns.append(btn)

        lay.addSpacing(4)

        # ── More prompts (collapsed) ──
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
        lay.addSpacing(8)

        # ── Status line (what fires next) + pause/play ──
        status_row = QHBoxLayout()
        status_row.setSpacing(4)

        self._status_label = QLabel("")
        self._status_label.setObjectName("status_line")
        status_row.addWidget(self._status_label, 1)

        self._pause_btn = SafeButton("⏸")
        self._pause_btn.setObjectName("pause_btn")
        self._pause_btn.setToolTip("Pause auto-continue")
        self._pause_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._pause_btn.clicked.connect(self._toggle_pause)
        status_row.addWidget(self._pause_btn)

        lay.addLayout(status_row)
        lay.addSpacing(8)

        # ── Custom prompt input ──
        input_row = QHBoxLayout()
        input_row.setSpacing(6)
        input_row.setAlignment(Qt.AlignmentFlag.AlignBottom)

        self._custom_input = FocusCancelTextEdit(self._cancel_countdown, self._engage_input)
        self._custom_input.setObjectName("custom")
        self._custom_input.setPlaceholderText("Custom prompt…")
        self._custom_input.setMaximumHeight(120)
        self._custom_input.document().contentsChanged.connect(self._on_input_changed)
        input_row.addWidget(self._custom_input)

        btn_col = QVBoxLayout()
        btn_col.setSpacing(4)
        btn_col.setAlignment(Qt.AlignmentFlag.AlignBottom)

        enqueue_btn = SafeButton("+")
        enqueue_btn.setObjectName("enqueue_btn")
        enqueue_btn.setToolTip("Add to queue  (Alt+Enter)")
        enqueue_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        enqueue_btn.clicked.connect(self._enqueue_custom)
        btn_col.addWidget(enqueue_btn)

        send_btn = SafeButton("→")
        send_btn.setObjectName("send_btn")
        send_btn.setToolTip("Send  (Enter)")
        send_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        send_btn.clicked.connect(self._submit_custom)
        btn_col.addWidget(send_btn)

        input_row.addLayout(btn_col)

        mic_col = QVBoxLayout()
        mic_col.setSpacing(3)
        mic_col.setContentsMargins(0, 0, 0, 0)
        mic_col.setAlignment(Qt.AlignmentFlag.AlignBottom)

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

        # Mic status row (hidden until recording/transcribing)
        self._mic_status = QLabel("")
        self._mic_status.setVisible(False)
        lay.addSpacing(4)
        lay.addWidget(self._mic_status)

        # ── Dismiss ──
        lay.addSpacing(6)
        dismiss_btn = SafeButton("Dismiss  ·  Esc")
        dismiss_btn.setObjectName("dismiss_hint")
        dismiss_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        dismiss_btn.clicked.connect(self._dismiss)
        lay.addWidget(dismiss_btn)

        outer.addWidget(card)

        # Initialise dynamic text
        self._update_primary_btn_text()
        self._update_status_label()
        self._update_pause_btn()

        if self._action_btns:
            self._action_btns[0].setFocus()

    def _on_input_changed(self):
        if self._custom_input_text().strip():
            self._cancel_countdown()
        self._update_status_label()

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
        url = f"{COCKPIT_URL}/control"
        env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}

        def _cockpit_ready():
            try:
                r = urllib.request.urlopen(f"{COCKPIT_URL}/api/health", timeout=2)
                return r.status == 200
            except Exception:
                return False

        def _launch_browser():
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

        subprocess.Popen(
            ["bash", "-lc", "cd ~/dev/cockpit && npm run dev"],
            env=env, start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._cockpit_poll(0, url, env, _launch_browser)

    def _cockpit_poll(self, attempt, url, env, launch_browser):
        import urllib.request
        if attempt > 20:
            return
        try:
            r = urllib.request.urlopen(f"{COCKPIT_URL}/api/health", timeout=2)
            if r.status == 200:
                launch_browser()
                return
        except Exception:
            pass
        QTimer.singleShot(2000, lambda: self._cockpit_poll(attempt + 1, url, env, launch_browser))

    def _submit_custom(self):
        text = self._custom_input_text().strip()
        if text:
            self._choose(f"{CUSTOM_CHOICE_PREFIX}{text}")

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
        elif Qt.Key.Key_1 <= key <= Qt.Key.Key_9:
            num = key - Qt.Key.Key_0
            all_btns = self._primary_btns + [b for b in self._action_btns if b not in self._primary_btns]
            if 0 <= num - 1 < len(all_btns):
                all_btns[num - 1].click()
        else:
            super().keyPressEvent(e)

    def _shift_focus(self, d: int):
        btns = self._action_btns
        f    = self.focusWidget()
        idx  = (btns.index(f) + d) % len(btns) if f in btns else 0
        btns[idx].setFocus()


# ── Confirm popup ──────────────────────────────────────────────────────────────

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
