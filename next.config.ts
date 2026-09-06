import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/transportation",
          destination: "/transportation-v2",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
