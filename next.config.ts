import type { NextConfig } from "next";

// Copied from https://github.com/gregrickaby/nextjs-github-pages
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
