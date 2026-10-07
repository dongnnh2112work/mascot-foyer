import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Demo code is JS-typed loosely; skip typecheck on Vercel build.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
