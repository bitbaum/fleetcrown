import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { isRuntimeAvailable } from "@/lib/runtime";
import { APP_SLUG } from "@/config/brand";

// WM_CLASS the pre-warmed beacon window is launched with. Must match
// scripts/fleetcrown-beacon-window.sh:BEACON_WM_CLASS (also derived from
// APP_SLUG) and the same constant in window/show/route.ts.
const BEACON_WM_CLASS = `${APP_SLUG}-beacon`;

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

  // Match only the actual beacon app window — brave creates ~2 internal splash
  // subwindows tagged with the same WM_CLASS, but only the page window has a
  // "Beacon" title. Skipping the others avoids unmapping invisible splashes.
  const search = spawnSync(
    "xdotool",
    ["search", "--class", BEACON_WM_CLASS, "--name", "Beacon"],
    { timeout: 1500 },
  );
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
