export async function fetchPriceProxy({
  mint,
  symbol,
}: {
  mint: string;
  symbol?: string;
}): Promise<number | null> {
  try {
    const isSol = mint === 'So11111111111111111111111111111111111111112' || symbol === 'SOL';

    const payload = {
      source: 'coingecko',
      params: {
        mint,
        symbol,
        isSol,
      },
    };

    console.log('📤 Sending proxy request with:', payload);

    const res = await fetch('/api/proxy/price', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn('❌ [proxy] Response not OK:', res.status);
      return null;
    }

    const data = await res.json();
    console.log('✅ [proxy] Price received:', data?.price);

    return data?.price ?? null;
  } catch (err: any) {
    console.error('🔥 [proxy] Error fetching price:', err.message);
    return null;
  }
}
