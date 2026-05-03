import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/api/agent/launch": ["./next.config.ts"],
  },
};

export default nextConfig;
