// app/api/utils/fetchTokenMetadata.ts
import { Metaplex } from '@metaplex-foundation/js';
import { connection } from '@/lib/solanaConnection';
import { PublicKey } from '@solana/web3.js';
import { fetchSolanaTokenList } from '@/lib/utils';

const metaplex = Metaplex.make(connection);

// Token listesi basit cache (process içinde)
let cachedTokenList: { address: string; symbol?: string; name?: string }[] | null = null;

async function getCachedTokenList() {
  if (!cachedTokenList) {
    try {
      cachedTokenList = await fetchSolanaTokenList();
    } catch (e) {
      console.error('❌ Failed to fetch token list:', e);
      cachedTokenList = [];
    }
  }
  return cachedTokenList!;
}

/** Verilen mint için (önce liste, sonra Metaplex) symbol/name döndürür */
export async function fetchTokenMetadata(
  mintAddress: string
): Promise<{ symbol: string; name: string } | null> {
  try {
    const list = await getCachedTokenList();
    // ⚠️ case-insensitive karşılaştırma
    const mLower = mintAddress.toLowerCase();
    const token = list.find((t: any) => String(t.address).toLowerCase() === mLower);

    if (token) {
      return {
        symbol: token.symbol || mintAddress.slice(0, 4),
        name: token.name || token.symbol || mintAddress.slice(0, 4),
      };
    }

    // Fallback: Metaplex NFT/metaplex metadata
    try {
      const mintPk = new PublicKey(mintAddress);
      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPk });
      if (nft) {
        return {
          symbol: nft.symbol || mintAddress.slice(0, 4),
          name: nft.name || nft.symbol || mintAddress.slice(0, 4),
        };
      }
    } catch {
      // no-op
    }

    return {
      symbol: mintAddress.slice(0, 4),
      name: mintAddress.slice(0, 4),
    };
  } catch (error) {
    console.error('❌ Failed to fetch token metadata:', error);
    return {
      symbol: mintAddress.slice(0, 4),
      name: mintAddress.slice(0, 4),
    };
  }
}
