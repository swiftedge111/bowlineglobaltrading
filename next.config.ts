import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/receipt/*/opengraph-image": ["./public/brand/bowline-logo-reversed-640.png"],
  },
};

export default nextConfig;
