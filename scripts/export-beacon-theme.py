#!/usr/bin/env python3
"""
Export beacon theme from globals.css → ~/.config/agent-dashboard-theme.json

Reads Cockpit's semantic design tokens (oklch) and converts them to hex so
beacon.py's PyQt palette stays in sync with the web UI without manual updates.

Run after changing globals.css colours:
  python3 scripts/export-beacon-theme.py
"""

import json, math, re, sys
from pathlib import Path

CSS_FILE = Path(__file__).resolve().parent.parent / "src" / "app" / "globals.css"
OUT_FILE = Path.home() / ".config" / "agent-dashboard-theme.json"


# ── oklch → sRGB hex ─────────────────────────────────────────────────────────

def _oklch_to_hex(L: float, C: float, H: float, alpha: float = 1.0) -> str:
    """Convert oklch(L C H) to #rrggbb (ignores alpha — PyQt handles it separately)."""
    # oklch → oklab
    h_rad = math.radians(H)
    a_ = C * math.cos(h_rad)
    b_ = C * math.sin(h_rad)

    # oklab → linear sRGB (D65 matrices)
    l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_
    m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_
    s_ = L - 0.0894841775 * a_ - 1.2914855480 * b_

    l3, m3, s3 = l_ ** 3, m_ ** 3, s_ ** 3

    r_lin =  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
    g_lin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
    b_lin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

    def _gamma(v: float) -> int:
        v = max(0.0, min(1.0, v))
        v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        return round(v * 255)

    return f"#{_gamma(r_lin):02x}{_gamma(g_lin):02x}{_gamma(b_lin):02x}"


def _parse_oklch(value: str) -> str | None:
    """Parse 'oklch(L C H)' or 'oklch(L C H / A%)' → hex. Returns None on failure."""
    m = re.match(
        r"oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)"
        r"(?:\s*/\s*([\d.]+)%?)?\s*\)",
        value.strip(),
    )
    if not m:
        return None
    L, C, H = float(m.group(1)), float(m.group(2)), float(m.group(3))
    alpha = float(m.group(4)) / 100 if m.group(4) else 1.0
    # For alpha < 1 blended over the dark surface (#0d0d0d ≈ L=0.07):
    if alpha < 1.0:
        surface_L = 0.07
        L = L * alpha + surface_L * (1 - alpha)
    return _oklch_to_hex(L, C, H)


# ── CSS token extraction ──────────────────────────────────────────────────────

def _extract_tokens(css: str, in_dark: bool) -> dict[str, str]:
    """Extract --token: oklch(...) pairs from the dark or light :root block."""
    tokens: dict[str, str] = {}

    if in_dark:
        # Match the .dark { ... } block
        m = re.search(r'\.dark\s*\{([^}]+)\}', css, re.DOTALL)
    else:
        # Match the first :root { ... } block (light)
        m = re.search(r':root\s*\{([^}]+)\}', css, re.DOTALL)

    if not m:
        return tokens

    for line in m.group(1).splitlines():
        lm = re.match(r'\s*--([\w-]+)\s*:\s*(oklch\([^)]+\))\s*;', line)
        if lm:
            hex_val = _parse_oklch(lm.group(2))
            if hex_val:
                tokens[lm.group(1)] = hex_val
    return tokens


# ── Palette mapping ───────────────────────────────────────────────────────────
# Maps PyQt palette key → CSS token name. One source of truth.

_DARK_MAP = {
    "card":              "surface-base",
    "surface":           "surface-raised",
    "surface2":          "surface-overlay",
    "border":            "border-default",
    "group_bg":          "surface-page",
    "accent":            "accent-primary",
    "accent_d":          "surface-raised",
    "btn_primary_bg":    "accent-primary",
    "btn_primary_fg":    "surface-page",
    "btn_primary_hover": "accent-hover",
    "text1":             "text-primary",
    "text2":             "text-secondary",
    "text3":             "text-tertiary",
    "group_lbl":         "text-muted",
    "green":             "status-positive",
    "green_d":           "status-positive-subtle",
    "amber":             "status-warning",
    "amber_d":           "status-warning-subtle",
    "red":               "status-negative",
    "red_d":             "status-negative-subtle",
    # Colours with no direct token — keep hardcoded fallbacks
    "allow_hover":       None,
    "deny_hover":        None,
    "label_next":        None,
    "label_progress":    None,
    "ship":              "status-positive",
    "ship_d":            "status-positive-subtle",
    "cyan":              None,
    "purple":            None,
}

_LIGHT_MAP = {
    "card":              "surface-base",
    "surface":           "surface-raised",
    "surface2":          "surface-overlay",
    "border":            "border-default",
    "group_bg":          "surface-page",
    "accent":            "accent-primary",
    "accent_d":          "surface-raised",
    "btn_primary_bg":    "accent-primary",
    "btn_primary_fg":    "text-inverted",
    "btn_primary_hover": "accent-hover",
    "text1":             "text-primary",
    "text2":             "text-secondary",
    "text3":             "text-tertiary",
    "group_lbl":         "text-muted",
    "green":             "status-positive",
    "green_d":           "status-positive-subtle",
    "amber":             "status-warning",
    "amber_d":           "status-warning-subtle",
    "red":               "status-negative",
    "red_d":             "status-negative-subtle",
    "allow_hover":       None,
    "deny_hover":        None,
    "label_next":        None,
    "label_progress":    None,
    "ship":              "status-positive",
    "ship_d":            "status-positive-subtle",
    "cyan":              None,
    "purple":            None,
}

# Hardcoded fallbacks for tokens with no CSS equivalent
_DARK_FALLBACKS = {
    "allow_hover":    "#163322",
    "deny_hover":     "#3d1212",
    "label_next":     "#38bdf8",
    "label_progress": "#fbbf24",
    "cyan":           "#38bdf8",
    "purple":         "#c084fc",
}
_LIGHT_FALLBACKS = {
    "allow_hover":    "#15803d",
    "deny_hover":     "#b91c1c",
    "label_next":     "#0369a1",
    "label_progress": "#92400e",
    "cyan":           "#0369a1",
    "purple":         "#7c3aed",
}


def _build_palette(tokens: dict[str, str], mapping: dict[str, str | None],
                   fallbacks: dict[str, str]) -> dict[str, str]:
    palette: dict[str, str] = {}
    for key, token in mapping.items():
        if token and token in tokens:
            palette[key] = tokens[token]
        elif key in fallbacks:
            palette[key] = fallbacks[key]
        # else: skip — beacon.py will use its own default
    return palette


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not CSS_FILE.exists():
        print(f"ERROR: {CSS_FILE} not found", file=sys.stderr)
        sys.exit(1)

    css = CSS_FILE.read_text()
    dark_tokens  = _extract_tokens(css, in_dark=True)
    light_tokens = _extract_tokens(css, in_dark=False)

    theme = {
        "dark":  _build_palette(dark_tokens,  _DARK_MAP,  _DARK_FALLBACKS),
        "light": _build_palette(light_tokens, _LIGHT_MAP, _LIGHT_FALLBACKS),
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(theme, indent=2) + "\n")

    print(f"✓ Wrote {OUT_FILE}")
    print(f"  dark  tokens: {len(theme['dark'])}")
    print(f"  light tokens: {len(theme['light'])}")

    if "--show" in sys.argv:
        print("\nDark palette:")
        for k, v in sorted(theme["dark"].items()):
            print(f"  {k:20s} {v}")
        print("\nLight palette:")
        for k, v in sorted(theme["light"].items()):
            print(f"  {k:20s} {v}")


if __name__ == "__main__":
    main()
