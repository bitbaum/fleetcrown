import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { isRuntimeAvailable } from "@/lib/runtime";

/**
 * Show the pre-warmed beacon window — maps it, moves it on-screen, raises
 * and activates it. Called by BeaconLiveClient's useEffect when a session
 * becomes active.
 *
 * Targets the cockpit-beacon-window.service chromium instance specifically
 * via WM_CLASS=cockpit-beacon, so a user's regular browser tab at the same
 * URL is never moved. No-ops cleanly if xdotool isn't installed or if no
 * matching window exists.
 *
 * All xdotool operations are chained into a single process invocation:
 * spawning a fresh xdotool per command was costing ~1s wall-clock for the
 * full sequence — chained, the whole show takes ~50ms (PyQt-equivalent).
 */

// Cache the primary screen width for the lifetime of the process. The screen
// can change at runtime (monitor hot-plug), so re-resolve once an hour to
// stay correct without paying the spawnSync cost on every show.
let cachedScreenW = 0;
let screenWAtMs = 0;
function getScreenWidth(): number {
  if (Date.now() - screenWAtMs < 3_600_000 && cachedScreenW > 0) return cachedScreenW;
  const geo = spawnSync("xdotool", ["getdisplaygeometry"], { timeout: 1500 });
  const w = parseInt(geo.stdout.toString().trim().split(/\s+/)[0] || "1920", 10) || 1920;
  cachedScreenW = w;
  screenWAtMs = Date.now();
  return w;
}

export async function POST() {
  if (!isRuntimeAvailable()) return NextResponse.json({ ok: false, reason: "no-runtime" }, { status: 503 });

  const search = spawnSync("xdotool", ["search", "--class", "cockpit-beacon"], { timeout: 1500 });
  if (search.status !== 0) {
    return NextResponse.json({ ok: false, reason: "xdotool-or-window-missing" });
  }
  const wids = search.stdout.toString().trim().split("\n").filter(Boolean);
  if (wids.length === 0) {
    return NextResponse.json({ ok: false, reason: "no-matching-window" });
  }

  const x = String(Math.max(0, getScreenWidth() - 600));

  // Chain windowmap + windowmove + windowactivate + windowraise per wid into
  // a single xdotool invocation. windowmap --sync blocks until the WM marks
  // the window as mapped, so subsequent move/activate don't silently skip.
  const args: string[] = [];
  for (const wid of wids) {
    args.push("windowmap", "--sync", wid);
    args.push("windowmove", wid, x, "80");
    args.push("windowactivate", "--sync", wid);
    args.push("windowraise", wid);
  }
  spawnSync("xdotool", args, { timeout: 3000 });

  return NextResponse.json({ ok: true, wids });
}
