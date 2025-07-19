import { Connection, clusterApiUrl } from '@solana/web3.js';

// Option 1: Solana resmi public RPC
export const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Option 2: Direkt public RPC adresi (alternatif)
// export const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
