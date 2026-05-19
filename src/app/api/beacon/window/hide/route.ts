import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { isRuntimeAvailable } from "@/lib/runtime";

/**
 * Hide the pre-warmed beacon window — moves it off-screen so the user
 * never sees an empty "Standby" placeholder. Called by BeaconLiveClient
 * when there's no active session.
 *
 * Uses windowmove to a far-offscreen coordinate rather than windowunmap,
 * because unmap can drop the window from the WM's task list in unhelpful
 * ways under some KDE versions. The window stays alive and SSE-connected.
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

  for (const wid of wids) {
    spawnSync("xdotool", ["windowmove", wid, "-32000", "-32000"], { timeout: 1500 });
  }

  return NextResponse.json({ ok: true, wids });
}
