// hooks/useChainTokensEvm.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address, Chain as EvmChain } from 'viem';

export type TokenBalance = {
  isNative: boolean;
  symbol: string;
  decimals: number;
  contract?: `0x${string}`;
  name?: string;
  amount: number;       // human units
  usdValue?: number;    // optional computed
  chainId: number;
};

type Clients = { publicClient: any }; // Viem PublicClient

export type Options = {
  covalent?: { apiKey: string } | undefined;
  getUsdValue?: (t: TokenBalance) => Promise<number>;
  /** human amount filtresi; default 0 */
  minAmount?: number;
};

function fmt(amountWei: bigint, decimals: number): number {
  const s = amountWei.toString();
  const pad = Math.max(decimals - s.length, 0);
  const whole = pad > 0 ? '0' : s.slice(0, s.length - decimals);
  const frac = (pad > 0 ? '0'.repeat(pad) + s : s.slice(-decimals)) || '';
  const num = Number(`${whole || '0'}.${frac.slice(0, 18)}`); // precision cap
  return Number.isFinite(num) ? num : 0;
}

export default function useChainTokensEvm(
  chain: EvmChain,
  account: Address | null,
  clients: Clients,
  opts: Options = {}
) {
  const { covalent, getUsdValue, minAmount } = opts;
  const threshold = typeof minAmount === 'number' ? minAmount : 0;

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const nativeTemplate = useMemo(() => {
    const nc = chain.nativeCurrency || { name: 'Native', symbol: 'COIN', decimals: 18 };
    return {
      isNative: true,
      symbol: nc.symbol || 'COIN',
      name: nc.name || 'Native',
      decimals: Number(nc.decimals ?? 18),
      chainId: chain.id,
    } as const;
  }, [chain]);

  const applyMin = useCallback(
    (list: TokenBalance[]) => list.filter((t) => (t?.amount ?? 0) >= threshold),
    [threshold]
  );

  const fetchNative = useCallback(async () => {
    const { publicClient } = clients;
    if (!publicClient || !account) return null;
    try {
      const wei: bigint = await publicClient.getBalance({ address: account });
      const amount = fmt(wei, nativeTemplate.decimals);
      const t: TokenBalance = { ...nativeTemplate, amount };
      if (getUsdValue) {
        try { t.usdValue = await getUsdValue(t); } catch {}
      }
      return t;
    } catch (e) {
      throw e;
    }
  }, [clients, account, nativeTemplate, getUsdValue]);

  const fetchWithCovalent = useCallback(async () => {
    if (!covalent?.apiKey || !account) return [] as TokenBalance[];
    // Covalent chain alias’ları
    const chainAlias: Record<number, string> = {
      1: 'eth-mainnet',
      56: 'bsc-mainnet',
      137: 'matic-mainnet',
      8453: 'base-mainnet',
      42161: 'arbitrum-one',
    };
    const chainName = chainAlias[chain.id];
    if (!chainName) {
      const n = await fetchNative();
      return n ? [n] : [];
    }

    const url = `https://api.covalenthq.com/v1/${chainName}/address/${account}/balances_v2/?no-nft=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${covalent.apiKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const n = await fetchNative();
      return n ? [n] : [];
    }
    const j = await res.json().catch(() => ({}));
    const items = Array.isArray(j?.data?.items) ? j.data.items : [];

    const list: TokenBalance[] = [];
    for (const it of items) {
      try {
        const isNative = Boolean(it?.native_token);
        const decimals = Number(it?.contract_decimals ?? (isNative ? nativeTemplate.decimals : 18));
        const symbol = String(it?.contract_ticker_symbol || (isNative ? nativeTemplate.symbol : 'TOKEN'));
        const name = String(it?.contract_name || (isNative ? nativeTemplate.name : 'Token'));
        const contract = isNative ? undefined : (String(it?.contract_address) as `0x${string}`);
        const raw = BigInt(it?.balance ?? '0');
        const amount = fmt(raw, decimals);

        const t: TokenBalance = { isNative, symbol, name, decimals, contract, amount, chainId: chain.id };
        if (getUsdValue) {
          try { t.usdValue = await getUsdValue(t); } catch {}
        }
        list.push(t);
      } catch {}
    }

    if (list.length === 0) {
      const n = await fetchNative();
      if (n) list.push(n);
    }
    return list;
  }, [covalent?.apiKey, account, chain.id, fetchNative, nativeTemplate, getUsdValue]);

  const reload = useCallback(async () => {
    if (!account) {
      setBalances([]);
      return;
    }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const list = covalent?.apiKey
        ? await fetchWithCovalent()
        : (await Promise.all([fetchNative()])).filter(Boolean) as TokenBalance[];

      if (!ac.signal.aborted) {
        setBalances(applyMin(list));
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(e);
        try {
          const n = await fetchNative();
          setBalances(applyMin(n ? [n] : []));
        } catch {}
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [account, covalent?.apiKey, fetchWithCovalent, fetchNative, applyMin]);

  useEffect(() => {
    reload();
    return () => acRef.current?.abort();
  }, [reload]);

  return { balances, loading, error, reload };
}
