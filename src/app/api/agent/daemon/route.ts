import { NextResponse } from "next/server";

/**
 * GET /api/agent/daemon
 *
 * Used to serve a gzipped tarball of the bash daemon (~3000 lines across
 * fleetcrown-daemon.sh / agent-hook-bridge.sh / agent-hook-lib.sh + a
 * Python beacon stack) so a new customer could install the local helper
 * runtime in one command. Retired in Session 4 of killing-the-bash-daemon
 * (2026-06-11). The bash stack has been replaced by Fleet Runner desktop
 * (Electron app) which customers download from /download as a signed
 * native installer per platform — no bash, no Python beacon, no systemd.
 *
 * Kept as a 410 Gone for existing installer scripts that may still POST
 * here. The Location header points at /download so a redirected browser
 * lands on the Fleet Runner download CTA.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "The bash daemon installer was retired on 2026-06-11. Download Fleet Runner from /download instead.",
      next: "/download",
    },
    {
      status: 410,
      headers: { Location: "/download" },
    },
  );
}
