// next.config.ts
import type { NextConfig } from "next";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const r = (m: string) => require.resolve(m, { paths: [process.cwd()] });

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ✅ Lint hataları deploy'u engellemesin
  },
  webpack: (config) => {
    // 🔒 Solana wallet-adapter paketlerini tek kopyaya sabitle
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@solana/wallet-adapter-react": r("@solana/wallet-adapter-react"),
      "@solana/wallet-adapter-base": r("@solana/wallet-adapter-base"),
      "@solana/wallet-adapter-wallets": r("@solana/wallet-adapter-wallets"),
    };
    return config;
  },
};

export default nextConfig;
