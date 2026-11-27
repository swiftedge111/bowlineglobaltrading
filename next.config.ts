import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/receipt/*/opengraph-image": ["./public/images/logo-options/01-bowline-knot.png"],
  },
};

export default nextConfig;
