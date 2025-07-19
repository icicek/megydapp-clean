import { Metaplex } from '@metaplex-foundation/js';
import { connection } from '@/lib/solanaConnection';
import { PublicKey } from '@solana/web3.js';

const metaplex = Metaplex.make(connection);

export async function fetchTokenMetadata(mintAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const mintPublicKey = new PublicKey(mintAddress);
    const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });

    if (nft) {
      return {
        symbol: nft.symbol,
        name: nft.name
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to fetch token metadata via Metaplex:', error);
    return null;
  }
}
