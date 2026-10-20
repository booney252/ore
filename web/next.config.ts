import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the Research page's "Add to the brain" form takes documents up to 8 MB
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
