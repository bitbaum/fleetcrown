#!/usr/bin/env python3
import os
import shutil
from pathlib import Path


def sync_file(target: Path, legacy: Path) -> None:
    if not legacy.exists():
        return
    if target.exists() and target.stat().st_mtime >= legacy.stat().st_mtime:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(legacy, target)


def main() -> int:
    home = Path(os.path.expanduser("~"))
    config = home / ".config"

    sync_file(config / "agent-projects.conf", config / "claude-projects.conf")
    sync_file(config / "agent-prompts.json", config / "claude-prompts.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
