// lib/pricing/client.ts
export async function fetchErc20UnitPrice(chainId: number, token: `0x${string}`) {
    const res = await fetch(`/api/price?chainId=${chainId}&token=${token}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`price ${res.status}`);
    const json = await res.json();
    return {
      unitPrice: Number(json?.price || 0),                   // 1 token = X USD
      sources: Array.isArray(json?.sources) ? json.sources : []
    };
  }
  
  export async function fetchNativeUnitPrice(chainId: number) {
    const res = await fetch(`/api/price/native?chainId=${chainId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`native price ${res.status}`);
    const json = await res.json();
    return {
      unitPrice: Number(json?.price || 0),                   // 1 native = X USD
      sources: Array.isArray(json?.sources) ? json.sources : []
    };
  }
  