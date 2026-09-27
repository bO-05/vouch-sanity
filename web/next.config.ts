import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A receipt upload carries the downscaled photo (a JPEG data URL, at most ~1.1 MB of text).
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
