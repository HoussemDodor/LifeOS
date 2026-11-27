import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // ING CSV imports go through a server action; allow a few months of exports at once.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
