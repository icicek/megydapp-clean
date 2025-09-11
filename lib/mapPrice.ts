// app/lib/mapPrice.ts  (yeni dosya)
export type PriceView = {
    fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
    usdValue: number;            // toplam
    priceSources: { price: number; source: string }[];
  };
  
  export function mapPriceApi(json: any, amount: number): PriceView {
    // /api/proxy/price dönüşü + backward-compat
    const ok = !!json?.ok || !!json?.success;
    const status: PriceView['fetchStatus'] =
      ok ? 'found' : (json?.status === 'not_found' ? 'not_found' : (json?.status === 'error' ? 'error' : 'error'));
  
    // unit → total
    const unitPrice = Number(json?.priceUsd ?? 0);
    const apiUsdValue = Number(json?.usdValue ?? 0);
    const total = ok
      ? (apiUsdValue > 0 ? apiUsdValue : unitPrice * (Number.isFinite(amount) && amount > 0 ? amount : 1))
      : 0;
  
    // sources (yoksa tekil kaynaktan inşa et)
    const sources = Array.isArray(json?.sources) && json.sources.length
      ? json.sources
      : (unitPrice > 0 && json?.source ? [{ source: String(json.source), price: unitPrice }] : []);
  
    return {
      fetchStatus: status,
      usdValue: Number.isFinite(total) ? total : 0,
      priceSources: sources,
    };
  }
  