import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "export",
  basePath: "/spendlock",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
