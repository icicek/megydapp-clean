import { Address } from 'viem';
import { fetchFromCoinGecko, fetchFromDefiLlama, fetchFromDexScreener, fetchFromZeroX, type PriceHit } from './sources';

export type AggregatedPrice = {
  price: number;                 // seçilen USD
  hits: PriceHit[];              // kaynaklar
  primary: PriceHit | null;      // seçilen kaynak
};

export async function getEvmUsdPrice(chainId: number, token: Address): Promise<AggregatedPrice> {
  const hits: PriceHit[] = [];

  // Sıra: CG → Llama → DexScreener → 0x
  const cg = await fetchFromCoinGecko(chainId, token).catch(() => null);
  if (cg) hits.push(cg);

  const ll = await fetchFromDefiLlama(chainId, token).catch(() => null);
  if (ll) hits.push(ll);

  const ds = await fetchFromDexScreener(chainId, token).catch(() => null);
  if (ds) hits.push(ds);

  const zx = await fetchFromZeroX(chainId, token).catch(() => null);
  if (zx) hits.push(zx);

  // Filtrele
  const usable = hits.filter(h => h && Number.isFinite(h.price) && h.price > 0);
  if (usable.length === 0) return { price: 0, hits: [], primary: null };

  // Eğer birden fazla değer yakınsa (±%5), ortalama al; aksi halde önceliğe göre seç
  const sorted = usable.slice().sort((a, b) => a.price - b.price);
  const mid = sorted[Math.floor(sorted.length / 2)].price;
  const within5 = usable.filter(h => Math.abs(h.price - mid) / mid <= 0.05);
  let chosen: PriceHit;
  if (within5.length >= 2) {
    const avg = within5.reduce((s, h) => s + h.price, 0) / within5.length;
    chosen = { ...within5[0], price: avg, source: within5[0].source };
  } else {
    // Öncelik sırası ile ilk bulunanı seç
    const order = ['coingecko', 'defillama', 'dexscreener', '0x'] as const;
    chosen = order
      .map(src => usable.find(h => h.source === src))
      .filter(Boolean)[0] as PriceHit;
  }

  return { price: chosen.price, hits: usable, primary: chosen };
}
