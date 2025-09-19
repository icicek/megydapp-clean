'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Address, Chain, formatUnits } from 'viem';
import { ERC20_ABI } from '@/lib/evm/erc20';
import { TOKEN_LIST, NATIVE_BY_CHAIN, type ListedToken } from '@/lib/evm/tokenList';

export type TokenBalance = {
  chainId: number;
  isNative: boolean;
  contract?: `0x${string}`; // undefined for native
  symbol: string;
  name: string;
  decimals: number;
  amount: string;           // human string
  raw: bigint;              // raw amount
  usdValue?: number | null; // optional, to be filled by your pricing pipeline (TOTAL USD)
  logoUrl?: string | null;
};

type Clients = {
  publicClient: any; // viem PublicClient
};

type Options = {
  covalent?: { apiKey: string };                       // optional indexer
  getUsdValue?: (t: TokenBalance) => Promise<number | null>; // returns TOTAL USD for that balance
  minAmount?: number;                                  // filter threshold
};

export default function useChainTokensEvm(
  chain: Chain,
  address: Address | null,
  clients: Clients,
  opts: Options = {}
) {
  const { publicClient } = clients;
  const { covalent, getUsdValue, minAmount = 0 } = opts;

  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tokenList = useMemo<ListedToken[]>(
    () => TOKEN_LIST[chain.id] ?? [],
    [chain.id]
  );

  const fetchViaCovalent = useCallback(async (): Promise<TokenBalance[] | null> => {
    if (!address) return null;
    try {
      const endpoint = covalent?.apiKey
        ? `https://api.covalenthq.com/v1/${chain.id}/address/${address}/balances_v2/?no-nft-fetch=true&quote-currency=USD&key=${covalent.apiKey}`
        : `/api/indexer/covalent?chainId=${chain.id}&address=${address}`;

      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Covalent ${res.status}`);
      const json = await res.json();
      const items = json?.data?.items ?? [];

      const nativeMeta = NATIVE_BY_CHAIN[chain.id] ?? { symbol: 'ETH', name: 'Ether' };
      const out: TokenBalance[] = [];

      for (const it of items) {
        const isNative =
          it.contract_address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
          it.type === 'native';
        const decimals = Number(it.contract_decimals ?? (isNative ? 18 : 18));
        const raw = BigInt(it.balance ?? '0');
        const amountNum = Number(formatUnits(raw, decimals));
        if (amountNum <= minAmount) continue;

        out.push({
          chainId: chain.id,
          isNative,
          contract: isNative ? undefined : (it.contract_address as `0x${string}`),
          symbol: isNative ? nativeMeta.symbol : (it.contract_ticker_symbol ?? 'TKN'),
          name:   isNative ? nativeMeta.name   : (it.contract_name ?? 'Token'),
          decimals,
          amount: formatUnits(raw, decimals),
          raw,
          usdValue: typeof it?.quote === 'number' ? it.quote : undefined, // this is TOTAL USD from Covalent
          logoUrl: it?.logo_url ?? null,
        });
      }
      return out;
    } catch (e: any) {
      console.warn('Covalent fallback → on-chain. Reason:', e?.message || e);
      return null;
    }
  }, [address, chain.id, covalent?.apiKey, minAmount]);

  const fetchViaOnChain = useCallback(async (): Promise<TokenBalance[]> => {
    if (!address) return [];
    const nativeMeta = NATIVE_BY_CHAIN[chain.id] ?? { symbol: 'ETH', name: 'Ether' };

    // 1) Native balance
    const nativeRaw = await publicClient.getBalance({ address });
    const native: TokenBalance = {
      chainId: chain.id,
      isNative: true,
      symbol: nativeMeta.symbol,
      name: nativeMeta.name,
      decimals: 18,
      raw: nativeRaw,
      amount: formatUnits(nativeRaw, 18),
      usdValue: undefined,
      logoUrl: null,
    };

    // 2) ERC-20s from curated list (fallback)
    const erc20s: TokenBalance[] = [];
    for (const t of tokenList) {
      try {
        const raw = await publicClient.readContract({
          address: t.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        if (raw === 0n) continue;

        erc20s.push({
          chainId: chain.id,
          isNative: false,
          contract: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          raw,
          amount: formatUnits(raw, t.decimals),
          usdValue: undefined,
          logoUrl: null,
        });
      } catch {
        // skip unreachable tokens
      }
    }

    return [native, ...erc20s].filter(t => Number(t.amount) > minAmount);
  }, [address, publicClient, chain.id, tokenList, minAmount]);

  const load = useCallback(async () => {
    if (!address) {
      setBalances([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const viaIndexer = await fetchViaCovalent();
      const list = viaIndexer ?? await fetchViaOnChain();

      if (getUsdValue) {
        const withPrices = await Promise.all(
          list.map(async (t) => {
            try {
              const p = await getUsdValue(t); // EXPECTS TOTAL USD
              return { ...t, usdValue: p };
            } catch {
              return t;
            }
          })
        );
        withPrices.sort((a, b) => (Number(b.usdValue ?? 0) - Number(a.usdValue ?? 0)));
        setBalances(withPrices);
      } else {
        list.sort((a, b) => (a.isNative === b.isNative ? Number(b.amount) - Number(a.amount) : a.isNative ? -1 : 1));
        setBalances(list);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load EVM tokens');
    } finally {
      setLoading(false);
    }
  }, [address, fetchViaCovalent, fetchViaOnChain, getUsdValue]);

  useEffect(() => { void load(); }, [load]);

  return { loading, error, balances, reload: load };
}
