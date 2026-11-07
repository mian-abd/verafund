import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted builds (Docker / Jetson) set NEXT_OUTPUT=standalone; Vercel uses its own output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
