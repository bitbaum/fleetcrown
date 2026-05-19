import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { isRuntimeAvailable } from "@/lib/runtime";

/**
 * Hide the pre-warmed beacon window so the user never sees an empty "Standby"
 * placeholder. Called by BeaconLiveClient when there's no active session.
 *
 * Uses windowunmap (X11 invisibility). windowmove to negative coordinates
 * doesn't work under KDE Plasma Wayland — KWin clamps offscreen positions
 * back onto the visible screen. unmap is the only reliable hide on this stack.
 * The window stays alive in memory and SSE-connected; the next show endpoint
 * windowmaps it back.
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

  // Chain into one xdotool invocation — fork+exec is the dominant cost, so
  // batching cuts the hide latency from ~250ms to ~30ms.
  const args: string[] = [];
  for (const wid of wids) args.push("windowunmap", wid);
  spawnSync("xdotool", args, { timeout: 2000 });

  return NextResponse.json({ ok: true, wids });
}
