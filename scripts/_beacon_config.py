"""Beacon — runtime constants and config-file helpers.  No PyQt dependency."""
import os, json

# Wire-format prefixes — must match constants in src/lib/constants/control.ts
CUSTOM_CHOICE_PREFIX = "custom:"
SWITCH_CHOICE_PREFIX = "switch:"

# Override via COCKPIT_URL env var for non-default ports or remote deployments.
COCKPIT_URL = os.environ.get("COCKPIT_URL", "http://localhost:3000").rstrip("/")

COUNTDOWN_SECONDS = 12   # default; overridden by settings file if present

_SETTINGS_PATH    = os.path.expanduser("~/.config/agent-dashboard-settings.json")
_META_PATH        = os.path.expanduser("~/.config/agent-prompts.json")
_LEGACY_META_PATH = os.path.expanduser("~/.config/claude-prompts.json")


def load_settings() -> dict:
    try:
        if os.path.exists(_SETTINGS_PATH):
            return json.load(open(_SETTINGS_PATH))
    except Exception:
        pass
    return {}


def load_prompt_meta() -> list:
    """Load prompt metadata from SSOT config file."""
    try:
        file = _META_PATH if os.path.exists(_META_PATH) else _LEGACY_META_PATH
        if os.path.exists(file):
            return json.load(open(file))
    except Exception:
        pass
    return []
