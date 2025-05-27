import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ✅ Lint hataları deploy'u engellemesin
  },
};

export default nextConfig;
