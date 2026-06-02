import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

/**
 * Serves a gzipped tarball of the local helper runtime so a new customer can
 * install the agent fleet without cloning the repo:
 *
 *   scripts/fleetcrown-daemon.sh — main polling loop
 *   scripts/_brand.sh            — brand SSOT (APP_NAME / APP_SLUG / APP_DOMAIN)
 *   scripts/agent-hook-lib.sh    — zellij inject_prompt + shared helpers
 *   scripts/agent-hook-bridge.sh — agent CLI bridge
 *
 * Together ~1500 lines of bash. They are the local execution surface.
 *
 * Tarball is built in pure Node — the first version of this route used
 * spawn("tar", ...) and 500'd on Vercel because the runtime image may not
 * carry the tar binary (or spawn can't reach it). The ustar format is
 * trivial enough (one 512-byte header per file + content padded to 512,
 * then 1024 zero bytes as end-of-archive) that doing it ourselves avoids
 * the system-binary dependency entirely.
 *
 * Files extract at the destination root (no `scripts/` prefix) so the
 * agent CLI writes them straight into ~/.local/share/fleetcrown/.
 *
 * Public (no auth) — matches the matcher exception in src/proxy.ts.
 * next.config.ts includes the source files in this route's
 * outputFileTracingIncludes so they land in the Vercel deployment bundle.
 */
const FILES = [
  // Core daemon + shared brand/zellij helpers + bridge entry point.
  "fleetcrown-daemon.sh",
  "fleet",
  "_brand.sh",
  "_agents.sh",
  "agent-hook-lib.sh",
  "agent-hook-bridge.sh",
  // Per-agent task runners. Claude uses an inline command (no runner); codex
  // and gemini require these wrappers — without them the daemon hard-fails
  // when dispatching either agent. The bridge expects $SCRIPT_DIR/run-X-task.sh.
  "run-codex-task.sh",
  "run-gemini-task.sh",
  // systemd installer — the agent CLI's --install flag spawns this so a new
  // customer's daemon survives shell exit. Uses $SCRIPT_DIR for service
  // WorkingDirectory + ExecStart, which resolves correctly under the flat
  // ~/.local/share/fleetcrown/ layout (no PROJECT_DIR/.. assumption is hit on
  // the env-var token path that the CLI feeds in).
  "install-fleetcrown-daemon.sh",
  // Python helpers referenced by agent-hook-bridge.sh. All are wrapped in
  // `|| true` / `2>/dev/null` in the bridge so absence degrades gracefully —
  // but real customers want the full experience (audio beacon, idle detection,
  // notifications). beacon imports _beacon_config so both ship together.
  "beacon.py",
  "_beacon_config.py",
  "get-idle-secs.py",
  "notify-choice.py",
  "sync-agent-runtime-config.py",
  // Audio transcription is invoked by fleetcrown-daemon.sh for recorded prompt
  // commands and must travel with the flat installed runtime.
  "transcribe.py",
] as const;

export async function GET() {
  const scriptsDir = path.join(process.cwd(), "scripts");

  try {
    const tarball = await buildTarball(scriptsDir, FILES);
    return new NextResponse(new Uint8Array(tarball), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Content-Disposition": 'attachment; filename="fleetcrown-daemon.tar.gz"',
      },
    });
  } catch (e) {
    console.error("[agent/daemon] build failed:", (e as Error)?.message, (e as Error)?.stack);
    return NextResponse.json(
      { error: "Daemon bundle unavailable", detail: (e as Error)?.message },
      { status: 500 },
    );
  }
}

/**
 * Build a ustar gzip archive in memory. No external binaries, no extra
 * deps — just Node builtins. ~50 lines of format-spec implementation.
 */
async function buildTarball(dir: string, files: readonly string[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (const name of files) {
    const content = await readFile(path.join(dir, name));
    chunks.push(ustarHeader(name, content.length));
    chunks.push(padTo512(content));
  }
  chunks.push(Buffer.alloc(1024)); // end-of-archive: two zeroed 512-byte blocks
  return gzipSync(Buffer.concat(chunks));
}

/**
 * ustar header (512 bytes). Mode 0755 for everything — the .sh files are
 * either run directly or sourced; making the non-executables executable
 * too is harmless. The agent CLI re-chmods the two main executables on
 * extraction regardless.
 *
 * Checksum is the sum of all header bytes treating the checksum field
 * itself as 8 ASCII spaces; written as 6-digit octal + NUL + space.
 */
function ustarHeader(name: string, size: number): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, Math.min(name.length, 99), "utf8");
  writeOctal(h, 100, 8, 0o755);
  writeOctal(h, 108, 8, 0);
  writeOctal(h, 116, 8, 0);
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, Math.floor(Date.now() / 1000));
  h.write("        ", 148, 8, "ascii"); // checksum placeholder = 8 spaces
  h.write("0", 156, 1, "ascii");          // typeflag: regular file
  h.write("ustar\0", 257, 6, "ascii");
  h.write("00", 263, 2, "ascii");

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

  return h;
}

function writeOctal(buf: Buffer, offset: number, len: number, value: number): void {
  // Format: zero-padded octal of (len-1) digits + trailing NUL.
  buf.write(value.toString(8).padStart(len - 1, "0") + "\0", offset, len, "ascii");
}

function padTo512(buf: Buffer): Buffer {
  const remainder = buf.length % 512;
  if (remainder === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(512 - remainder)]);
}
