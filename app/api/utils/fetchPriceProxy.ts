export async function fetchPriceProxy({
  mint,
  symbol,
}: {
  mint: string;
  symbol?: string;
}): Promise<number | null> {
  try {
    console.log('📡 [proxy] Fetching price from /api/proxy/price...');
    const res = await fetch('/api/proxy/price', {
      method: 'POST',
      body: JSON.stringify({ mint, symbol }),
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
  } catch (err) {
    console.error('🔥 [proxy] Error fetching price:', err.message);
    return null;
  }
}
