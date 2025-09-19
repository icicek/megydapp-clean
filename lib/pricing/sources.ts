// lib/pricing/sources.ts
import type { Address, Chain } from 'viem';
import { createPublicClient, http } from 'viem';
import { mainnet, bsc, polygon, base, arbitrum } from 'viem/chains';
import { ERC20_ABI } from '@/lib/evm/erc20';
import { COINGECKO_PLATFORM, ZEROX_BASE } from './chainMaps';

export type PriceHit = {
  source: 'coingecko' | 'defillama' | 'dexscreener' | '0x';
  price: number;
  updatedAt?: number | null;
  meta?: any;
};

const CHAIN_BY_ID: Record<number, Chain> = {
  1: mainnet,
  56: bsc,
  137: polygon,
  8453: base,
  42161: arbitrum,
};

export async function fetchFromCoinGecko(
  chainId: number,
  token: Address
): Promise<PriceHit | null> {
  const platform = COINGECKO_PLATFORM[chainId];
  if (!platform) return null;

  const u = new URL(`https://api.coingecko.com/api/v3/simple/token_price/${platform}`);
  u.searchParams.set('contract_addresses', token);
  u.searchParams.set('vs_currencies', 'usd');
  u.searchParams.set('include_24hr_vol', 'true');
  u.searchParams.set('include_last_updated_at', 'true');

  const res = await fetch(u.toString(), { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const hit = json?.[(token as string).toLowerCase()];
  if (!hit || typeof hit.usd !== 'number') return null;

  return {
    source: 'coingecko',
    price: Number(hit.usd),
    updatedAt: hit.last_updated_at ? Number(hit.last_updated_at) * 1000 : undefined,
    meta: { vol24h: hit.usd_24h_vol },
  };
}

export async function fetchFromDefiLlama(
  chainId: number,
  token: Address
): Promise<PriceHit | null> {
  const platform = COINGECKO_PLATFORM[chainId];
  if (!platform) return null;

  const key = `${platform}:${token}`;
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

export async function fetchFromDexScreener(
  _chainId: number,
  token: Address
): Promise<PriceHit | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : [];

  let best: any = null;
  for (const p of pairs) {
    const priceUsd = Number(p?.priceUsd);
    const liqUsd = Number(p?.liquidity?.usd ?? 0);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
    if (!best || liqUsd > Number(best?.liquidity?.usd ?? 0)) best = p;
  }
  if (!best) return null;

  return {
    source: 'dexscreener',
    price: Number(best.priceUsd),
    updatedAt: best?.updatedAt ? Number(best.updatedAt) : undefined,
    meta: { dexId: best?.dexId, pairAddress: best?.pairAddress, liquidityUsd: best?.liquidity?.usd },
  };
}

async function getDecimals(chainId: number, token: Address): Promise<number> {
  const chain = CHAIN_BY_ID[chainId];
  if (!chain) return 18;
  const pc = createPublicClient({ chain, transport: http() });
  try {
    const d = await pc.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as number;
    return Number(d) || 18;
  } catch {
    return 18;
  }
}

export async function fetchFromZeroX(
  chainId: number,
  token: Address
): Promise<PriceHit | null> {
  const baseUrl = ZEROX_BASE[chainId];
  if (!baseUrl) return null;

  const USDC_BY_CHAIN: Record<number, Address> = {
    1:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    56:  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    8453:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    42161:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  };
  const usdc = USDC_BY_CHAIN[chainId];
  if (!usdc) return null;

  const decimals = await getDecimals(chainId, token);
  const sellAmount = (BigInt(10) ** BigInt(decimals)).toString(); // 1 token

  const u = new URL(`${baseUrl}/swap/v1/price`);
  u.searchParams.set('sellToken', token);
  u.searchParams.set('buyToken', usdc);
  u.searchParams.set('sellAmount', sellAmount);

  const res = await fetch(u.toString(), { cache: 'no-store' });
  if (!res.ok) return null;

  const json = await res.json();
  const buyAmount = json?.buyAmount ? BigInt(json.buyAmount) : null;
  if (!buyAmount) return null;

  const price = Number(buyAmount) / 1e6; // USDC has 6 decimals
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    source: '0x',
    price,
    updatedAt: Date.now(),
    meta: { estimatedGas: json?.estimatedGas, route: json?.sources },
  };
}
