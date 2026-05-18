"""Beacon — runtime constants and config-file helpers.  No PyQt dependency."""
import os, json, subprocess

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


def read_project_git_branch(label: str) -> str | None:
    """Look up the project directory from claude-projects.conf and return the git branch.

    Tries agent-projects.conf first (new), then claude-projects.conf (legacy).
    Returns None if the directory is not found or is not a git repo.
    """
    tab = label.lower()
    conf_paths = [
        os.path.expanduser(os.environ.get("AGENT_PROJECTS_CONF", "~/.config/agent-projects.conf")),
        os.path.expanduser("~/.config/claude-projects.conf"),
    ]
    for conf in conf_paths:
        if not os.path.exists(conf):
            continue
        try:
            for line in open(conf).read().split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("|")
                if len(parts) < 2 or parts[0].strip().lower() != tab:
                    continue
                d = os.path.expanduser(parts[1].strip())
                if not os.path.isdir(d):
                    continue
                result = subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=d, capture_output=True, text=True, timeout=2,
                )
                if result.returncode == 0:
                    return result.stdout.strip() or None
        except Exception:
            pass
    return None
