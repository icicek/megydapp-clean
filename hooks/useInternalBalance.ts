// hooks/useInternalBalance.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { connection } from '@/lib/solanaConnection';

export type InternalBalance = { amount: number; decimals: number } | null;

export function quantize(amount: number, decimals: number) {
  const f = Math.pow(10, decimals);
  return Math.floor(amount * f) / f;
}

export function useInternalBalance(tokenMint: string | null | undefined, opts?: { isSOL?: boolean }) {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<InternalBalance>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const isSOL = !!(opts?.isSOL || tokenMint === 'SOL');

  const refresh = useCallback(async () => {
    try {
      if (!publicKey || !tokenMint) {
        setBalance(null);
        return;
      }
      setLoading(true);
      setError(null);

      if (isSOL) {
        const lamports = await connection.getBalance(publicKey);
        setBalance({ amount: lamports / 1e9, decimals: 9 });
        return;
      }

      const mintPk = new PublicKey(tokenMint);
      const [mintInfo, ata] = await Promise.all([
        getMint(connection, mintPk),
        getAssociatedTokenAddress(mintPk, publicKey),
      ]);

      const accInfo = await connection.getAccountInfo(ata);
      if (!accInfo) {
        setBalance({ amount: 0, decimals: mintInfo.decimals });
        return;
      }

      const acc = await getAccount(connection, ata);
      const raw = Number(acc.amount);
      const amt = raw / Math.pow(10, mintInfo.decimals);
      setBalance({ amount: amt, decimals: mintInfo.decimals });
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch balance');
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, tokenMint, isSOL]);

  useEffect(() => {
    let cancelled = false;
    (async () => { await refresh(); })();
    return () => { cancelled = true; };
  }, [refresh, publicKey, connected]);

  return { balance, loading, error, refresh, isSOL };
}
