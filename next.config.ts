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
    // Serves the bash daemon bundle (4 scripts ~1500 lines) so a new
    // customer can install the local execution surface without cloning
    // the repo. Same tree-shaking concern as /install above.
    "/api/agent/daemon": [
      "./scripts/cockpit-daemon.sh",
      "./scripts/_brand.sh",
      "./scripts/agent-hook-lib.sh",
      "./scripts/agent-hook-bridge.sh",
    ],
  },
};

export default nextConfig;
