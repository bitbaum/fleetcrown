"""Beacon — theme/color system.  No PyQt dependency."""
import os, json, subprocess

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


def load_theme() -> dict:
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
