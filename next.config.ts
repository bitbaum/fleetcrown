import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
    // CRITICAL — without this glob every serverless function deployed to
    // Vercel exceeded the 250 MB unzipped limit and the whole deploy
    // failed silently. The desktop/ subtree is the Electron app + its
    // node_modules + bundled Zellij (~35 MB) + AppImage build artifacts.
    // It has NOTHING to do with the web app, but Next.js's output:
    // "standalone" tracer was copying the whole tree into every function
    // on the off chance any web code happened to import something from
    // `desktop/`. Nothing does. The "*" key applies the exclusion to
    // every route bundle.
    "*": [
      "./desktop/**",
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
    // tracing, Vercel would tree-shake the file out of the deployment bundle.
    "/api/agent/install": ["./packages/agent/bin/**"],
    // Serves the bash + python daemon bundle so a new customer can install
    // the full local execution surface without cloning the repo. Keep this
    // list in sync with FILES in src/app/api/agent/daemon/route.ts —
    // anything not traced here gets tree-shaken out of the deployment.
    "/api/agent/daemon": [
      "./scripts/fleetcrown-daemon.sh",
      "./scripts/fleet",
      "./scripts/_brand.sh",
      "./scripts/_agents.sh",
      "./scripts/agent-hook-lib.sh",
      "./scripts/agent-hook-bridge.sh",
      "./scripts/run-codex-task.sh",
      "./scripts/run-gemini-task.sh",
      "./scripts/install-fleetcrown-daemon.sh",
      "./scripts/beacon.py",
      "./scripts/_beacon_config.py",
      "./scripts/get-idle-secs.py",
      "./scripts/notify-choice.py",
      "./scripts/sync-agent-runtime-config.py",
      "./scripts/transcribe.py",
    ],
  },
};

export default nextConfig;
