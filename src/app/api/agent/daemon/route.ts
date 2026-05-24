import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Serves a gzipped tarball of the 4 daemon scripts so a new customer can
 * install the agent fleet without cloning the cockpit repo:
 *
 *   scripts/cockpit-daemon.sh   — main polling loop (~780 lines)
 *   scripts/_brand.sh           — brand SSOT (APP_NAME / APP_SLUG / APP_DOMAIN)
 *   scripts/agent-hook-lib.sh   — zellij inject_prompt + shared helpers
 *   scripts/agent-hook-bridge.sh — agent CLI bridge (~660 lines)
 *
 * Together: ~1500 lines of bash. Together they are the local execution surface.
 *
 * Tarred with `-C scripts/` so the files extract at the destination root with
 * no `scripts/` prefix — the agent CLI then writes them straight into
 * ~/.local/share/cockpit/ and references them by basename.
 *
 * Public (no auth) — matches the matcher exception in src/proxy.ts.
 * Designed to be piped: curl -fsSL ${APP_URL}/api/agent/daemon | tar -xzC ~/.local/share/cockpit
 *
 * next.config.ts includes the 4 source files in this route's
 * outputFileTracingIncludes so they land in the Vercel deployment bundle.
 */
export async function GET() {
  const scriptsDir = path.join(process.cwd(), "scripts");
  const files = ["cockpit-daemon.sh", "_brand.sh", "agent-hook-lib.sh", "agent-hook-bridge.sh"];

  try {
    const tarball = await tarGzip(scriptsDir, files);
    return new NextResponse(new Uint8Array(tarball), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Content-Disposition": 'attachment; filename="cockpit-daemon.tar.gz"',
      },
    });
  } catch (e) {
    console.error("[agent/daemon] tar failed:", (e as Error)?.message);
    return NextResponse.json(
      { error: "Daemon bundle unavailable" },
      { status: 500 },
    );
  }
}

/**
 * Spawn `tar -czf - -C <cwd> <file...>` and collect stdout into a buffer.
 * Rejects on non-zero exit or stderr. The tarball is small (~60KB raw,
 * smaller compressed) so collecting in memory is fine — no need to stream.
 */
function tarGzip(cwd: string, files: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", "-", "-C", cwd, ...files], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`tar exited ${code}: ${stderr.trim()}`));
    });
  });
}
