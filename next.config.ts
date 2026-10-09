import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
