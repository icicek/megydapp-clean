import { Metaplex } from '@metaplex-foundation/js';
import { connection } from '@/lib/solanaConnection';
import { PublicKey } from '@solana/web3.js';
import { fetchSolanaTokenList } from '@/lib/utils';

const metaplex = Metaplex.make(connection);

export async function fetchTokenMetadata(mintAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    // Önce token listten kontrol et
    const tokenList = await fetchSolanaTokenList();
    const token = tokenList.find(t => t.address === mintAddress);
    if (token) {
      return {
        symbol: token.symbol,
        name: token.name || token.symbol
      };
    }

    // Eğer bulamazsa Metaplex'ten kontrol et (NFT olabilir ihtimaline karşı)
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
    console.error('❌ Failed to fetch token metadata:', error);
    return null;
  }
}
