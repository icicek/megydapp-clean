// lib/client/fetchTokenMetadataClient.ts
export type TokenMeta = { symbol?: string; logoURI?: string; name?: string } | null;

export async function fetchTokenMetadataClient(mint: string): Promise<TokenMeta> {
  try {
    const res = await fetch(`/api/token-meta?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j ? { symbol: j.symbol, logoURI: j.logoURI ?? j.logo, name: j.name } : null;
  } catch {
    return null;
  }
}
