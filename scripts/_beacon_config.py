"""Beacon — runtime constants and config-file helpers.  No PyQt dependency."""
import os, json, re, shutil, subprocess

# Wire-format prefixes — must match constants in src/lib/constants/control.ts
CUSTOM_CHOICE_PREFIX = "custom:"
SWITCH_CHOICE_PREFIX = "switch:"

# Override via COCKPIT_URL env var for non-default ports or remote deployments.
COCKPIT_URL = os.environ.get("COCKPIT_URL", "http://localhost:3000").rstrip("/")

COUNTDOWN_SECONDS = 12   # default; overridden by settings file if present
MIN_IDLE_SECONDS  = 0    # 0 = always show popup; overridden by settings file if present

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


def get_min_idle_seconds() -> int:
    """Return the configured idle-gate threshold; 0 = always show."""
    s = load_settings()
    v = s.get("min_idle_seconds", MIN_IDLE_SECONDS)
    try:
        return max(0, int(v))
    except (TypeError, ValueError):
        return MIN_IDLE_SECONDS


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


# Agent fallback order — must match AGENT_FALLBACK_ORDER in src/lib/agent-registry.ts
_AGENT_FALLBACK_ORDER = ["claude", "codex", "gemini"]
_VALID_AGENTS = frozenset(_AGENT_FALLBACK_ORDER)


def looks_like_capacity_issue(text: str) -> bool:
    """Mirror of looksLikeAgentCapacityIssue() in src/lib/agent-registry.ts."""
    return bool(re.search(
        r"rate\s*limit|quota|credit|usage\s*limit|token\s*limit|out\s+of\s+tokens"
        r"|context\s*(window|length|limit)|maximum\s+context|insufficient\s+quota",
        text, re.IGNORECASE,
    ))


def resolve_next_agent(current_agent: str | None) -> str | None:
    """Mirror of resolveNextAvailableAgent() in src/lib/agent-registry.ts.

    Returns the first switchable agent after current_agent in fallback order
    whose CLI is present on PATH, or None if no alternative is available.
    """
    current = current_agent if current_agent in _VALID_AGENTS else None
    available = {a for a in _AGENT_FALLBACK_ORDER if shutil.which(a)}

    if current and current in _AGENT_FALLBACK_ORDER:
        idx = _AGENT_FALLBACK_ORDER.index(current)
        for candidate in _AGENT_FALLBACK_ORDER[idx + 1:]:
            if candidate in available:
                return candidate

    for candidate in _AGENT_FALLBACK_ORDER:
        if candidate != current and candidate in available:
            return candidate

    return None
