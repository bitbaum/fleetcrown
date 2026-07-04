import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME, APP_SLUG } from "@/config/brand";

/**
 * Serves the @fleetcrown/agent CLI script body so a new customer can install
 * it from the cloud without needing the package to be published on npm.
 *
 * The package lives at packages/agent/bin/fleetcrown-agent.js and is NOT
 * published to npm — this endpoint is the working install path until it is.
 *
 * Public (no auth) — matches the matcher exception in src/proxy.ts.
 * Designed to be piped: curl -fsSL https://<your-domain>/api/agent/install | node - init --token ck_…
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "packages", "agent", "bin", "fleetcrown-agent.js");
    const body = await readFile(filePath, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-FleetCrown-Agent": `${APP_SLUG}-agent`,
      },
    });
  } catch (e) {
    console.error(`[${APP_SLUG}/agent/install] failed to read agent script:`, (e as Error)?.message);
    return NextResponse.json(
      { error: `${APP_NAME} agent script unavailable` },
      { status: 500 },
    );
  }
}
