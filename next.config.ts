import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Build-time version stamp — baked into the client bundle as NEXT_PUBLIC_* so
// the UI can show "which build is this" under the logo (and a changelog link).
// SHA is the precise build identity; the package version is the marketing
// semver. Computed once at build; on the box the push-deploy hook builds
// locally then rsyncs, so the SHA reflects the deployed commit. The desktop
// (Fleet Runner) version is read separately at runtime from the User-Agent
// (`FleetRunner/<ver>`, set in desktop/src/main/index.ts).
function buildSha(): string {
  if (process.env.FLEETCROWN_BUILD_SHA) return process.env.FLEETCROWN_BUILD_SHA;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "dev";
  }
}
const PKG_VERSION = (() => {
  try { return (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version; }
  catch { return "0.0.0"; }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  // node-pty is a native addon (compiled .node) — it must stay external, never
  // bundled by Turbopack/webpack, and only runs in the Node runtime. It backs
  // the LocalPtyExecutor (FleetCrown-owned agent PTYs). See
  // docs/architecture/agent-execution-platform.md.
  serverExternalPackages: ["node-pty"],
  env: {
    NEXT_PUBLIC_APP_VERSION: PKG_VERSION,
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  outputFileTracingExcludes: {
    "/api/agent/launch": ["./next.config.ts"],
    "/api/system/doctor": ["./next.config.ts"],
    // CRITICAL — without this glob the standalone build's per-route bundles
    // ballooned (the tracer copies traced deps into each), wasting disk and
    // build time. The desktop/ subtree is the Electron app + its
    // node_modules + bundled Zellij (~35 MB) + AppImage build artifacts.
    // It has NOTHING to do with the web app, but Next.js's output:
    // "standalone" tracer was copying the whole tree into every function
    // on the off chance any web code happened to import something from
    // `desktop/`. Nothing does. The "*" key applies the exclusion to
    // every route bundle.
    "*": [
      "./next.config.ts",
      "./desktop/**",
      // The v0.6 event bridge is its own Node service that runs on the box
      // (alongside Postgres) — not part of the web app bundle. Excluding the
      // directory keeps its node_modules out of every route bundle. Same
      // lesson as desktop/.
      "./bridge/**",
      // AppImage extraction artifacts (e.g., from `./Fleet-Runner-*.AppImage
      // --appimage-extract`) drop a `squashfs-root/` tree containing the
      // full unpacked Electron app (~300 MB). It also has nothing to do
      // with the web app; tracing was including it whenever a dev had
      // extracted an AppImage in the repo root for inspection.
      "./squashfs-root/**",
    ],
  },
  outputFileTracingIncludes: {
    // Serves the @fleetcrown/agent CLI script to new customers (the package
    // isn't published to npm yet and the repo is private). Without explicit
    // tracing, the standalone tracer would drop the file from the build.
    "/api/agent/install": ["./packages/agent/bin/**"],
    // Markdown content read at runtime via process.cwd()/content (e.g. the
    // /whitepaper page). Tracing it INTO the standalone build makes it
    // deterministically present at .next/standalone/content/, instead of
    // relying on the postbuild deploy-local.sh copy — which raced with the
    // standalone recreate and intermittently left /whitepaper 500-ing
    // (ENOENT content/whitepaper.md), repeatedly failing the pre-push smoke.
    "/whitepaper": ["./content/**"],
    // /api/agent/daemon's bash + python bundle entries are gone — Session 4 of
    // killing-the-bash-daemon (2026-06-11) deleted the source files and the
    // route now returns 410 Gone pointing at /download for Fleet Runner.
  },
};

export default nextConfig;
