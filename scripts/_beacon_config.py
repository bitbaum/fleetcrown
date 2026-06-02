"""Beacon — runtime constants and config-file helpers.  No PyQt dependency."""
import os, json, re, shutil, subprocess, time
import urllib.request

# Wire-format prefixes — must match constants in src/lib/constants/control.ts
CUSTOM_CHOICE_PREFIX = "custom:"
SWITCH_CHOICE_PREFIX = "switch:"

# Override via COCKPIT_URL env var for non-default ports or remote deployments.
COCKPIT_URL = os.environ.get("COCKPIT_URL", "http://localhost:3000").rstrip("/")

COUNTDOWN_SECONDS = 12   # default; overridden by settings API if reachable
MIN_IDLE_SECONDS  = 0    # 0 = always show popup; overridden by settings API if reachable

# Legacy file path — kept as fallback when API is unreachable
_SETTINGS_PATH     = os.path.expanduser("~/.config/agent-dashboard-settings.json")
# Per-session cache so we only make one API call per beacon invocation
_SETTINGS_CACHE    = os.path.join("/tmp", "cockpit-beacon-settings.json")
_CACHE_TTL_SECONDS = 300  # 5 minutes

_META_PATH        = os.path.expanduser("~/.config/agent-prompts.json")
_LEGACY_META_PATH = os.path.expanduser("~/.config/claude-prompts.json")


def _read_daemon_token() -> str:
    """Return COCKPIT_DAEMON_TOKEN from env or .env.local file."""
    t = os.environ.get("COCKPIT_DAEMON_TOKEN", "")
    if t:
        return t
    # Try .env.local next to the cockpit project root (two levels above scripts/)
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    try:
        for line in open(env_path):
            line = line.strip()
            if line.startswith("COCKPIT_DAEMON_TOKEN="):
                return line[len("COCKPIT_DAEMON_TOKEN="):].strip()
    except Exception:
        pass
    return ""


def load_settings() -> dict:
    """Return beacon settings, fetching from the Cockpit API with 5-min cache.

    Falls back to the legacy JSON file when the API is unreachable (e.g. Cockpit
    not running at daemon startup time).
    """
    # 1. Try warm cache first (avoids HTTP on every hook invocation)
    try:
        cached = json.load(open(_SETTINGS_CACHE))
        if time.time() - cached.get("ts", 0) < _CACHE_TTL_SECONDS:
            return cached.get("data", {})
    except Exception:
        pass

    # 2. Fetch from API using daemon token
    token = _read_daemon_token()
    if token:
        try:
            req = urllib.request.Request(
                f"{COCKPIT_URL}/api/beacon-settings",
                headers={"Authorization": f"Bearer {token}"},
            )
            resp = urllib.request.urlopen(req, timeout=2)
            data = json.loads(resp.read().decode())
            # Write cache
            try:
                with open(_SETTINGS_CACHE, "w") as f:
                    json.dump({"data": data, "ts": time.time()}, f)
            except Exception:
                pass
            return data
        except Exception:
            pass

    # 3. Legacy file fallback (single-user installs or Cockpit offline)
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


def get_popup_mode() -> str:
    """Return the configured popup mode.

    The PyQt fallback has been retired. The settings DB may still contain
    legacy values 'pyqt' or 'both' from before the migration — both are
    coerced to 'web' since that's the only popup surface we ship now.
    """
    s = load_settings()
    mode = s.get("popup_mode", "web")
    if mode == "disabled":
        return "disabled"
    return "web"  # legacy 'both' / 'pyqt' both collapse to web


def get_auto_inject_mode() -> str:
    """Return the autopilot trust-ladder level used by every hook surface.

    Default is "beacon" (L3): popup with smart choices + countdown auto-pick.
    Was "strategist" (L5) until 2026-05-31 — flipped after user feedback that
    L5 felt like a loose cannon. Five levels: off / queue_only / beacon /
    next_best / strategist (Manual / Queue / Beacon / Continuous / Mission).
    Safety rails live in /api/control/dispatch and the Stop-hook gates
    (status:working refusal, pending-blocker refusal, hard_stop, queue prio).
    """
    mode = load_settings().get("auto_inject_mode", "beacon")
    return mode if mode in {"off", "queue_only", "beacon", "next_best", "strategist"} else "beacon"


def load_prompt_meta() -> list:
    """Load prompt metadata from SSOT config file.
    DEPRECATED for primary use per debt-reduction-roadmap: Beacon should read
    from Cockpit-owned contracts (lib/orchestration/intents.ts + /api or generated
    agent-prompts) not local claude-prompts.json. Fallback only for offline.
    See Phase 4 of execution plan. Prompt *meaning* lives in Cockpit now.
    """
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
