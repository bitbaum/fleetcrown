#!/usr/bin/env python3
"""Show an OS notification with action buttons and return the chosen key to stdout.

Usage:
  notify-choice.py <summary> <body> <project_label> [key=Label ...]

Prints the chosen key on stdout, then exits 0.
Exits 0 with no output if dismissed or timed out.

Side effect: when an action is chosen, also writes the choice to the matching
/tmp/fleetcrown-beacon/{id}.json session file so offline diagnostics can read it
and closes itself automatically.
"""

import sys, os, json, glob, time
from gi.repository import Notify, GLib  # type: ignore[import]


_BEACON_DIR = "/tmp/fleetcrown-beacon"
_TIMEOUT_MS = 12_000


def _write_beacon_choice(project: str, choice: str) -> None:
    """Write choice into the most-recent active beacon session for this project."""
    cutoff_ms = (time.time() - 180) * 1000  # ignore sessions older than 3 min
    candidates = []
    for path in glob.glob(os.path.join(_BEACON_DIR, "*.json")):
        try:
            data = json.loads(open(path).read())
            if (data.get("project") == project
                    and data.get("choice") is None
                    and data.get("createdAt", 0) > cutoff_ms):
                candidates.append((data["createdAt"], path, data))
        except Exception:
            pass
    if not candidates:
        return
    _, path, data = max(candidates)
    data["choice"] = choice
    with open(path, "w") as fh:
        json.dump(data, fh)


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(1)

    summary = sys.argv[1]
    body = sys.argv[2]
    project = sys.argv[3]
    raw_actions = sys.argv[4:]  # "key=Label" pairs

    actions: list[tuple[str, str]] = []
    for a in raw_actions:
        if "=" in a:
            key, label = a.split("=", 1)
            actions.append((key.strip(), label.strip()))

    Notify.init("fleetcrown-beacon")
    notif = Notify.Notification.new(summary, body, "dialog-information")
    notif.set_urgency(Notify.Urgency.NORMAL)
    notif.set_timeout(_TIMEOUT_MS)

    loop = GLib.MainLoop()
    chosen: list[str] = []

    def on_action(_notif: object, action_key: str, *_args: object) -> None:
        chosen.append(action_key)
        loop.quit()

    def on_closed(_notif: object, *_args: object) -> None:
        loop.quit()

    for key, label in actions:
        notif.add_action(key, label, on_action)

    notif.connect("closed", on_closed)
    GLib.timeout_add(_TIMEOUT_MS + 1000, loop.quit)

    notif.show()
    loop.run()
    Notify.uninit()

    if chosen:
        choice = chosen[0]
        _write_beacon_choice(project, choice)
        print(choice)


if __name__ == "__main__":
    main()
