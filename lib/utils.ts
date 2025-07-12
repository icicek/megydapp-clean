export interface SolanaToken {
  address: string;
  symbol: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  tags?: string[];
}

export async function fetchSolanaTokenList(): Promise<SolanaToken[]> {
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json'
    );

    if (!res.ok) {
      console.error('❌ Token list fetch failed with status:', res.status);
      return [];
    }

    const data = await res.json();
    console.log('✅ Token list received:', data?.tokens?.length, 'items');
    return data.tokens || [];
  } catch (err) {
    console.error('❌ Token list fetch exception:', err);
    return [];
  }
}
