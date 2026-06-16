import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the @cockpit/agent CLI script body so a new customer can install
 * it from the cloud without needing the package to be published on npm.
 *
 * The package exists at packages/agent/bin/cockpit-agent.js but is NOT
 * published — `npm view @cockpit/agent` returns 404 — and the repo itself
 * is private, so the raw GitHub URL is also gated. Until the package
 * ships to npm publicly, this endpoint is the only working install path.
 *
 * Public (no auth) — matches the matcher exception in src/proxy.ts.
 * Designed to be piped: curl -fsSL ${APP_URL}/api/agent/install | node - init --token ck_…
 *
 * next.config.ts includes packages/agent/bin/** in this route's
 * outputFileTracingIncludes so the file lands in the standalone build
 * bundle (it would otherwise be tree-shaken out as not imported).
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "packages", "agent", "bin", "cockpit-agent.js");
    const body = await readFile(filePath, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (e) {
    console.error("[agent/install] failed to read agent script:", (e as Error)?.message);
    return NextResponse.json(
      { error: "Agent script unavailable" },
      { status: 500 },
    );
  }
}
