#!/usr/bin/env python3
import os
import shutil
import tempfile
import urllib.error
import urllib.request
from pathlib import Path


def sync_file(target: Path, legacy: Path) -> None:
    if not legacy.exists():
        return
    if target.exists() and target.stat().st_mtime >= legacy.stat().st_mtime:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(legacy, target)


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def clean_field(value: object) -> str:
    return str(value or "").replace("|", "-").replace("\n", " ").strip()


def sync_projects_from_cloud(target: Path, env: dict[str, str]) -> bool:
    base_url = (os.environ.get("COCKPIT_BASE_URL") or os.environ.get("APP_BASE_URL") or env.get("COCKPIT_BASE_URL") or env.get("APP_BASE_URL") or "").rstrip("/")
    token = os.environ.get("COCKPIT_DAEMON_TOKEN") or os.environ.get("APP_DAEMON_TOKEN") or env.get("COCKPIT_DAEMON_TOKEN") or env.get("APP_DAEMON_TOKEN") or ""
    if not base_url or not token:
        return False

    req = urllib.request.Request(
        f"{base_url}/api/agent/projects",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            import json
            payload = json.loads(res.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, ValueError):
        return False

    projects = payload.get("projects")
    if not isinstance(projects, list):
        return False

    lines = [
        "# Managed by Cockpit. Edit projects in the web Control page; the daemon syncs this file.",
        "# Format: tab_name|/absolute/path/to/project|agent",
    ]
    for project in projects:
        if not isinstance(project, dict):
            continue
        name = clean_field(project.get("name"))
        dir_path = clean_field(project.get("dirPath"))
        agent = clean_field(project.get("agent"))
        if name and dir_path:
            lines.append(f"{name}|{dir_path}|{agent}")

    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(target.parent), delete=False) as tmp:
        tmp.write("\n".join(lines) + "\n")
        tmp_name = tmp.name
    os.replace(tmp_name, target)
    return True


def main() -> int:
    home = Path(os.path.expanduser("~"))
    config = home / ".config"
    cockpit_env = read_env_file(config / "cockpit" / "daemon.env")

    if not sync_projects_from_cloud(config / "agent-projects.conf", cockpit_env):
        sync_file(config / "agent-projects.conf", config / "claude-projects.conf")
    sync_file(config / "agent-prompts.json", config / "claude-prompts.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
