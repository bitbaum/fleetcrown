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
  },
};

export default nextConfig;
