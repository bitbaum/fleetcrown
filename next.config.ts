import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/api/agent/launch": ["./next.config.ts"],
  },
  outputFileTracingIncludes: {
    // Serves the @cockpit/agent CLI script to new customers (the package
    // isn't published to npm yet and the repo is private). Without explicit
    // tracing, Vercel would tree-shake the file out of the deployment bundle.
    "/api/agent/install": ["./packages/agent/bin/**"],
    // Serves the bash + python daemon bundle so a new customer can install
    // the full local execution surface without cloning the repo. Keep this
    // list in sync with FILES in src/app/api/agent/daemon/route.ts —
    // anything not traced here gets tree-shaken out of the deployment.
    "/api/agent/daemon": [
      "./scripts/cockpit-daemon.sh",
      "./scripts/_brand.sh",
      "./scripts/agent-hook-lib.sh",
      "./scripts/agent-hook-bridge.sh",
      "./scripts/run-codex-task.sh",
      "./scripts/run-gemini-task.sh",
      "./scripts/beacon.py",
      "./scripts/_beacon_config.py",
      "./scripts/get-idle-secs.py",
      "./scripts/notify-choice.py",
      "./scripts/sync-agent-runtime-config.py",
    ],
  },
};

export default nextConfig;
