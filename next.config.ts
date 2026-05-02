import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/agent/launch": ["./next.config.ts"],
  },
};

export default nextConfig;
