import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {"/api/lic9040": ["./public/forms/LIC9040-background.pdf", "./public/forms/RosterSans.ttf"]},
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
