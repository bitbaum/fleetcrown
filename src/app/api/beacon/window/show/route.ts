import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { isRuntimeAvailable } from "@/lib/runtime";

/**
 * Show the pre-warmed beacon window — moves it on-screen and raises it.
 * Called by BeaconLiveClient's useEffect when a session becomes active.
 *
 * Targets the cockpit-beacon-window.service chromium instance specifically
 * via WM_CLASS=cockpit-beacon, so a user's regular browser tab at the same
 * URL is never moved. No-ops cleanly if xdotool isn't installed or if no
 * matching window exists.
 */
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

  // Place at top-right of the primary screen. xdotool getdisplaygeometry returns "W H".
  const geo = spawnSync("xdotool", ["getdisplaygeometry"], { timeout: 1500 });
  const [screenW = 1920] = geo.stdout.toString().trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
  const x = Math.max(0, screenW - 600);

  for (const wid of wids) {
    // map FIRST, then move/activate/raise — moving an unmapped window can be ignored.
    spawnSync("xdotool", ["windowmap", "--sync", wid], { timeout: 2000 });
    spawnSync("xdotool", ["windowmove", wid, String(x), "80"], { timeout: 1500 });
    spawnSync("xdotool", ["windowactivate", "--sync", wid], { timeout: 1500 });
    spawnSync("xdotool", ["windowraise", wid], { timeout: 1500 });
  }

  return NextResponse.json({ ok: true, wids });
}
