// lib/solanaConnection.ts
import { Connection, clusterApiUrl } from '@solana/web3.js';

// 🔹 Client tarafında sadece *public* endpoint kullanalım.
// Vercel'de: NEXT_PUBLIC_SOLANA_RPC_URL = Alchemy Solana RPC URL'in
const endpoint =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  clusterApiUrl('mainnet-beta'); // son çare, rate-limit olabilir ama dursun

export const connection = new Connection(endpoint, 'confirmed');
