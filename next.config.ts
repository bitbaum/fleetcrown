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
      // The v0.6 event bridge is its own Node service that runs on Oracle
      // (or wherever we host Postgres) — not on Vercel. Excluding the
      // directory keeps its node_modules out of every serverless function
      // bundle. Same lesson as desktop/.
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
    // tracing, Vercel would tree-shake the file out of the deployment bundle.
    "/api/agent/install": ["./packages/agent/bin/**"],
    // /api/agent/daemon's bash + python bundle entries are gone — Session 4 of
    // killing-the-bash-daemon (2026-06-11) deleted the source files and the
    // route now returns 410 Gone pointing at /download for Fleet Runner.
  },
};

export default nextConfig;
