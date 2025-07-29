import { Metaplex } from '@metaplex-foundation/js';
import { connection } from '@/lib/solanaConnection';
import { PublicKey } from '@solana/web3.js';
import { fetchSolanaTokenList } from '@/lib/utils';

const metaplex = Metaplex.make(connection);

// Token listesi önbelleğe alınacak
let cachedTokenList: any[] | null = null;

async function getCachedTokenList() {
  if (!cachedTokenList) {
    try {
      cachedTokenList = await fetchSolanaTokenList();
    } catch (e) {
      console.error('❌ Failed to fetch token list:', e);
      cachedTokenList = [];
    }
  }
  return cachedTokenList;
}

export async function fetchTokenMetadata(mintAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const tokenList = await getCachedTokenList();
    const token = tokenList.find(t => t.address === mintAddress);

    if (token) {
      return {
        symbol: token.symbol,
        name: token.name || token.symbol,
      };
    }

    const mintPublicKey = new PublicKey(mintAddress);

    // Metaplex -> bazı sürümlerde run() gerekir
    const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });

    if (nft) {
      return {
        symbol: nft.symbol || mintAddress.slice(0, 4),
        name: nft.name || mintAddress.slice(0, 4),
      };
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
