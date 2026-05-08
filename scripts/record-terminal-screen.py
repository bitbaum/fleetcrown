#!/usr/bin/env python3
"""
Write the current monitor geometry to /tmp/claude-screen-<PANE_ID>.

Called at `claude` startup when the cursor is still inside the terminal.
Uses libX11 ctypes — no Qt required, runs in ~10ms.

Usage: python3 record-terminal-screen.py <pane_id>
"""
import ctypes, ctypes.util, os, re, subprocess, sys


def _cursor_pos_x11() -> tuple[int, int] | None:
    """Return cursor (x, y) via libX11 on DISPLAY=:1 (XWayland)."""
    lib = ctypes.util.find_library("X11")
    if not lib:
        return None
    try:
        xlib = ctypes.cdll.LoadLibrary(lib)
        Display = ctypes.c_void_p
        Window  = ctypes.c_ulong

        xlib.XOpenDisplay.restype  = Display
        xlib.XOpenDisplay.argtypes = [ctypes.c_char_p]

        display_name = os.environ.get("DISPLAY", ":1").encode()
        dpy = xlib.XOpenDisplay(display_name)
        if not dpy:
            dpy = xlib.XOpenDisplay(b":1")
        if not dpy:
            return None

        root = xlib.XDefaultRootWindow(dpy)
        Int  = ctypes.c_int
        ULong = ctypes.c_ulong
        UInt = ctypes.c_uint
        xlib.XQueryPointer.restype  = ctypes.c_bool
        xlib.XQueryPointer.argtypes = [
            Display, Window,
            ctypes.POINTER(ULong), ctypes.POINTER(ULong),
            ctypes.POINTER(Int),   ctypes.POINTER(Int),
            ctypes.POINTER(Int),   ctypes.POINTER(Int),
            ctypes.POINTER(UInt),
        ]
        root_ret = ULong(); child_ret = ULong()
        rx = Int(); ry = Int(); wx = Int(); wy = Int(); mask = UInt()
        xlib.XQueryPointer(dpy, root,
            ctypes.byref(root_ret), ctypes.byref(child_ret),
            ctypes.byref(rx), ctypes.byref(ry),
            ctypes.byref(wx), ctypes.byref(wy),
            ctypes.byref(mask))
        xlib.XCloseDisplay(dpy)
        return rx.value, ry.value
    except Exception:
        return None


def _monitors_from_xrandr() -> list[tuple[int, int, int, int]]:
    """Parse xrandr output → list of (x, y, w, h) for each connected monitor."""
    try:
        r = subprocess.run(["xrandr", "--query"],
                           capture_output=True, text=True, timeout=2)
        monitors = []
        for line in r.stdout.splitlines():
            m = re.search(r"(\d+)x(\d+)\+(\d+)\+(\d+)", line)
            if m and " connected" in line:
                w, h, x, y = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
                monitors.append((x, y, w, h))
        return monitors
    except Exception:
        return []


def _primary_from_xrandr() -> tuple[int, int, int, int] | None:
    """Return the monitor marked 'primary' in xrandr output."""
    try:
        r = subprocess.run(["xrandr", "--query"],
                           capture_output=True, text=True, timeout=2)
        for line in r.stdout.splitlines():
            if " connected primary" in line:
                m = re.search(r"(\d+)x(\d+)\+(\d+)\+(\d+)", line)
                if m:
                    w, h, x, y = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
                    return x, y, w, h
    except Exception:
        pass
    return None


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(1)
    pane_id = sys.argv[1]
    out_file = f"/tmp/claude-screen-{pane_id}"

    monitors = _monitors_from_xrandr()
    pos = _cursor_pos_x11()

    chosen: tuple[int, int, int, int] | None = None

    if pos and monitors:
        cx, cy = pos
        for (x, y, w, h) in monitors:
            if x <= cx < x + w and y <= cy < y + h:
                chosen = (x, y, w, h)
                break

    if chosen is None:
        chosen = _primary_from_xrandr()

    if chosen:
        x, y, w, h = chosen
        with open(out_file, "w") as f:
            f.write(f"{x},{y},{w},{h}\n")


if __name__ == "__main__":
    main()
