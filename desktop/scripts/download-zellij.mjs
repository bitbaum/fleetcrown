// Downloads the upstream Zellij binary into resources/bin/ so electron-builder
// can pack it into the AppImage / .deb / .dmg. Each shipped Fleet Runner thus
// includes a known-good Zellij, eliminating the #1 required prerequisite from
// the user-facing install flow.
//
// Runs from `npm run dist:linux` / `dist:mac` via prebuild. Skips silently if
// the target binary is already present and is a non-empty file (so incremental
// rebuilds stay fast). Safe to delete resources/bin/ to force a re-download.
//
// Pinned version — bumping it is the only mechanism for upgrading the bundled
// Zellij. Keep this in sync with what we expect the worker (home/worker.ts) to
// drive. Tested against this release across distros and Plasma versions.
import { createWriteStream } from "node:fs";
import { mkdir, stat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";

const ZELLIJ_VERSION = "v0.41.2";
const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_BIN = join(__dirname, "..", "resources", "bin");

// Map Node's process.platform/arch to upstream Zellij release asset names. The
// upstream project tags tarballs as zellij-<triple>.tar.gz. Only the platforms
// Fleet Runner targets are listed; PRs for additional ones go here.
const TARGETS = {
  "linux-x64": "zellij-x86_64-unknown-linux-musl.tar.gz",
  "linux-arm64": "zellij-aarch64-unknown-linux-musl.tar.gz",
  "darwin-x64": "zellij-x86_64-apple-darwin.tar.gz",
  "darwin-arm64": "zellij-aarch64-apple-darwin.tar.gz",
};

function resolveTarget() {
  const explicit = process.env.ZELLIJ_TARGET;
  if (explicit) return explicit;
  return `${process.platform}-${process.arch}`;
}

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function downloadTo(url, dest) {
  // Follow redirects manually — GitHub release downloads always 302 to a
  // signed S3 URL. Native fetch in Node 22+ handles this transparently.
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}) for ${url}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  const target = resolveTarget();
  const asset = TARGETS[target];
  if (!asset) {
    console.error(`[zellij] no bundled binary mapping for target "${target}". Skipping.`);
    return;
  }

  const binPath = join(RESOURCES_BIN, "zellij");
  if ((await exists(binPath)) && !process.env.FORCE) {
    console.log(`[zellij] already present at ${binPath} — skip (set FORCE=1 to re-download)`);
    return;
  }

  await mkdir(RESOURCES_BIN, { recursive: true });
  const tarball = join(RESOURCES_BIN, asset);
  const url = `https://github.com/zellij-org/zellij/releases/download/${ZELLIJ_VERSION}/${asset}`;
  console.log(`[zellij] downloading ${url}`);
  await downloadTo(url, tarball);

  // Extract just the `zellij` entry from the tarball. The upstream archive is
  // a flat tar.gz containing one binary; we use system tar to avoid a heavy
  // userland tar dependency, since prebuild runs on dev/CI machines that all
  // have it.
  execFileSync("tar", ["-xzf", tarball, "-C", RESOURCES_BIN], { stdio: "inherit" });
  await chmod(binPath, 0o755);

  // Remove the tarball — only the binary needs to ship inside the AppImage.
  try {
    await import("node:fs/promises").then((m) => m.unlink(tarball));
  } catch {
    /* non-fatal */
  }

  console.log(`[zellij] bundled at ${binPath}`);
  // Silence unused-import lint in some envs where zlib isn't reached above.
  void zlib;
}

main().catch((err) => {
  console.error("[zellij] failed to bundle:", err);
  // Don't fail the whole build — Fleet Runner falls back to PATH-resolved
  // Zellij if the bundled binary is missing. The prerequisites copy on the
  // download page still tells the user to install Zellij as a fallback.
  process.exit(0);
});
