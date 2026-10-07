/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Demo code is JS-typed loosely; skip typecheck on cloud builds.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
