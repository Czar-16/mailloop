import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};
export default nextConfig;
