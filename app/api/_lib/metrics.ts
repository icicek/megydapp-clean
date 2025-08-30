// app/api/_lib/metrics.ts
export type LatestMetrics = {
  usdValue: number;
  volumeUSD?: number;
  liquidityUSD?: number;
};

// Küçük yardımcı
function toNumberSafe(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * METRICS_PROVIDER:
 *  - 'birdeye'  -> Birdeye public API (X-API-KEY gerekir)
 *  - 'jup'      -> Jupiter price API (API key gerektirmez)
 *  - yok/diğer  -> null döner (cron skip)
 *
 * Ek ENV:
 *  - BIRDEYE_API_KEY (birdeye için zorunlu)
 */
export async function getLatestMetrics(mint: string): Promise<LatestMetrics | null> {
  const provider = (process.env.METRICS_PROVIDER || '').toLowerCase();

  try {
    if (provider === 'birdeye') {
      const apiKey = process.env.BIRDEYE_API_KEY || '';
      if (!apiKey) return null;

      // Fiyat (Birdeye)
      const priceRes = await fetch(
        `https://public-api.birdeye.so/defi/price?address=${encodeURIComponent(mint)}&chain=solana`,
        { headers: { 'X-API-KEY': apiKey } }
      );
      if (!priceRes.ok) return null;
      const priceJson: any = await priceRes.json();
      const price = toNumberSafe(priceJson?.data?.value);
      if (price == null) return null;

      // Burada istersen ek çağrılarla volume/liquidity getirebilirsin
      return { usdValue: price };

    } else if (provider === 'jup') {
      // Jupiter price v6 (anahtar gerektirmez)
      const jupRes = await fetch(
        `https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}`
      );
      if (!jupRes.ok) return null;
      const jupJson: any = await jupRes.json();
      const entry = jupJson?.data?.[mint];
      const price = toNumberSafe(entry?.price);
      if (price == null) return null;
      return { usdValue: price };
    }

    // Provider tanımlı değilse güvenli varsayılan: skip
    return null;
  } catch {
    return null;
  }
}
