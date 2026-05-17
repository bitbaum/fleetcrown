#!/usr/bin/env python3
"""Print seconds since last user input. Prints 9999 when no source is available.

Detection order (first that succeeds wins):
  1. libXss  — XScreenSaver extension via libX11 + libXss  (most accurate)
  2. /dev/pts — youngest pseudo-terminal atime             (terminal activity only)
  3. 9999     — safe fallback: treat as idle → show beacon
"""
import ctypes, sys, os, glob, time


def _via_xss() -> int | None:
    """Return idle seconds via libXss (requires MIT-SCREEN-SAVER X11 extension)."""
    try:
        class _Info(ctypes.Structure):
            _fields_ = [
                ("window",       ctypes.c_ulong),
                ("state",        ctypes.c_int),
                ("kind",         ctypes.c_int),
                ("til_or_since", ctypes.c_ulong),
                ("idle",         ctypes.c_ulong),
                ("event_mask",   ctypes.c_ulong),
            ]

        x11 = ctypes.CDLL("libX11.so.6")
        ss  = ctypes.CDLL("libXss.so.1")

        x11.XOpenDisplay.restype       = ctypes.c_void_p
        x11.XOpenDisplay.argtypes      = [ctypes.c_char_p]
        x11.XDefaultRootWindow.restype  = ctypes.c_ulong
        x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
        x11.XCloseDisplay.argtypes      = [ctypes.c_void_p]
        ss.XScreenSaverAllocInfo.restype  = ctypes.POINTER(_Info)
        ss.XScreenSaverAllocInfo.argtypes = []
        ss.XScreenSaverQueryInfo.restype  = ctypes.c_int
        ss.XScreenSaverQueryInfo.argtypes = [
            ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(_Info),
        ]

        display = os.environ.get("DISPLAY", ":0").encode()
        dp = x11.XOpenDisplay(display)
        if not dp:
            return None
        root = x11.XDefaultRootWindow(dp)
        info = ss.XScreenSaverAllocInfo()
        if not info:
            x11.XCloseDisplay(dp)
            return None
        ok = ss.XScreenSaverQueryInfo(dp, root, info)
        result = info.contents.idle // 1000 if ok else None
        x11.XCloseDisplay(dp)
        return result
    except Exception:
        return None


def _via_pts() -> int | None:
    """Return seconds since last activity on any /dev/pts device.

    Youngest atime across all pseudo-terminals is a reliable proxy for 'user is
    active in a terminal' — it covers the Claude Code pane and any other shell the
    user may be typing in.
    """
    try:
        now = time.time()
        ages = []
        for dev in glob.glob("/dev/pts/*"):
            try:
                ages.append(now - os.stat(dev).st_atime)
            except OSError:
                pass
        return int(min(ages)) if ages else None
    except Exception:
        return None


def main() -> None:
    result = _via_xss()
    if result is None:
        result = _via_pts()
    print(result if result is not None else 9999)


if __name__ == "__main__":
    main()
