#!/usr/bin/env python3
"""Print X11 idle time in seconds. Prints 9999 on any error (safe fallback = show beacon)."""
import ctypes, sys, os


class _XSSInfo(ctypes.Structure):
    _fields_ = [
        ("window",       ctypes.c_ulong),
        ("state",        ctypes.c_int),
        ("kind",         ctypes.c_int),
        ("til_or_since", ctypes.c_ulong),
        ("idle",         ctypes.c_ulong),
        ("event_mask",   ctypes.c_ulong),
    ]


try:
    x11 = ctypes.CDLL("libX11.so.6")
    ss  = ctypes.CDLL("libXss.so.1")

    x11.XOpenDisplay.restype       = ctypes.c_void_p
    x11.XOpenDisplay.argtypes      = [ctypes.c_char_p]
    x11.XDefaultRootWindow.restype  = ctypes.c_ulong
    x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    x11.XCloseDisplay.argtypes      = [ctypes.c_void_p]

    ss.XScreenSaverAllocInfo.restype  = ctypes.POINTER(_XSSInfo)
    ss.XScreenSaverAllocInfo.argtypes = []
    ss.XScreenSaverQueryInfo.restype  = ctypes.c_int
    ss.XScreenSaverQueryInfo.argtypes = [
        ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(_XSSInfo),
    ]

    display = os.environ.get("DISPLAY", ":0").encode()
    dp = x11.XOpenDisplay(display)
    if not dp:
        print(9999)
        sys.exit(0)

    root = x11.XDefaultRootWindow(dp)
    info = ss.XScreenSaverAllocInfo()
    if not info:
        x11.XCloseDisplay(dp)
        print(9999)
        sys.exit(0)

    ok = ss.XScreenSaverQueryInfo(dp, root, info)
    idle_secs = info.contents.idle // 1000 if ok else 9999
    x11.XCloseDisplay(dp)
    print(idle_secs)
except Exception:
    print(9999)
