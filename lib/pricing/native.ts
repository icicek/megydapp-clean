// lib/pricing/native.ts
import type { Address } from 'viem';
import { fetchFromDexScreener, fetchFromZeroX, type PriceHit } from './sources';

/** CoinGecko IDs for native coins by EVM chainId */
export const NATIVE_COINGECKO_ID: Record<number, string> = {
  1: 'ethereum',         // ETH
  56: 'binancecoin',     // BNB
  137: 'matic-network',  // MATIC
  8453: 'ethereum',      // Base uses ETH
  42161: 'ethereum',     // Arbitrum uses ETH
};

/** Wrapped-native addresses per chain for Dex/0x fallbacks */
export const WRAPPED_NATIVE_BY_CHAIN: Record<number, Address> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',     // WETH
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',     // WBNB
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
  8453: '0x4200000000000000000000000000000000000006',    // WETH (Base)
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',   // WETH (Arbitrum)
};

export type AggregatedPrice = {
  price: number;
  hits: PriceHit[];
  primary: PriceHit | null;
};

/** Native from CoinGecko simple/price by id */
async function fetchNativeFromCoinGecko(chainId: number): Promise<PriceHit | null> {
  const id = NATIVE_COINGECKO_ID[chainId];
  if (!id) return null;

  const u = new URL('https://api.coingecko.com/api/v3/simple/price');
  u.searchParams.set('ids', id);
  u.searchParams.set('vs_currencies', 'usd');
  u.searchParams.set('include_last_updated_at', 'true');

  const res = await fetch(u.toString(), { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const row = json?.[id];
  if (!row || typeof row.usd !== 'number') return null;
  const updatedAt = row?.last_updated_at ? Number(row.last_updated_at) * 1000 : undefined;

  return { source: 'coingecko', price: Number(row.usd), updatedAt };
}

/** Native from DeFi Llama via coingecko:<id> */
async function fetchNativeFromDefiLlama(chainId: number): Promise<PriceHit | null> {
  const id = NATIVE_COINGECKO_ID[chainId];
  if (!id) return null;

  const key = `coingecko:${id}`;
  const res = await fetch(`https://coins.llama.fi/prices/current/${key}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const val = json?.coins?.[key];
  if (!val || typeof val.price !== 'number') return null;

  return {
    source: 'defillama',
    price: Number(val.price),
    updatedAt: val.timestamp ? Number(val.timestamp) * 1000 : undefined,
  };
}

/**
 * Aggregate native price using:
 * 1) CoinGecko ID
 * 2) DeFi Llama (by coingecko:id)
 * 3) DexScreener (wrapped native address)
 * 4) 0x price (wrapped native address)
 */
export async function getNativeUsdUnitPrice(chainId: number): Promise<AggregatedPrice> {
  const hits: PriceHit[] = [];

  const cg = await fetchNativeFromCoinGecko(chainId).catch(() => null);
  if (cg) hits.push(cg);

  const ll = await fetchNativeFromDefiLlama(chainId).catch(() => null);
  if (ll) hits.push(ll);

  const wrapped = WRAPPED_NATIVE_BY_CHAIN[chainId];
  if (wrapped) {
    const ds = await fetchFromDexScreener(chainId, wrapped).catch(() => null);
    if (ds) hits.push(ds);

    const zx = await fetchFromZeroX(chainId, wrapped).catch(() => null);
    if (zx) hits.push(zx);
  }

  const usable = hits.filter(h => h && Number.isFinite(h.price) && h.price > 0);
  if (usable.length === 0) return { price: 0, hits: [], primary: null };

  // Consensus within ±5% → average; else priority order
  const sorted = usable.slice().sort((a, b) => a.price - b.price);
  const mid = sorted[Math.floor(sorted.length / 2)].price;
  const within5 = usable.filter(h => Math.abs(h.price - mid) / mid <= 0.05);

  let chosen: PriceHit;
  if (within5.length >= 2) {
    const avg = within5.reduce((s, h) => s + h.price, 0) / within5.length;
    chosen = { ...within5[0], price: avg };
  } else {
    const order = ['coingecko', 'defillama', 'dexscreener', '0x'] as const;
    chosen = order.map(src => usable.find(h => h.source === src)).filter(Boolean)[0] as PriceHit;
  }

  return { price: chosen.price, hits: usable, primary: chosen };
}
