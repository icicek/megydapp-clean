// hooks/useInternalBalance.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { connection as fallbackConnection } from '@/lib/solanaConnection';

export type InternalBalance = { amount: number; decimals: number } | null;

export function quantize(amount: number, decimals: number) {
  const f = Math.pow(10, decimals);
  return Math.floor(amount * f) / f;
}

function rawToUiString(raw: string, decimals: number): string {
  if (!raw) return '0';
  const s = String(raw).replace(/^0+/, '') || '0';
  if (!decimals) return s;
  if (s.length <= decimals) {
    const zeros = '0'.repeat(decimals - s.length);
    const frac = (zeros + s).replace(/0+$/, '');
    return frac ? `0.${frac}` : '0';
  }
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

export function useInternalBalance(
  tokenMint: string | null | undefined,
  opts?: { isSOL?: boolean }
) {
  const { publicKey, connected } = useWallet();
  const { connection: providerConnection } = useConnection();
  const connection = providerConnection ?? fallbackConnection;

  const [balance, setBalance] = useState<InternalBalance>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  const isSOL = !!(opts?.isSOL || tokenMint === 'SOL');

  const refresh = useCallback(async () => {
    const reqId = ++reqIdRef.current;

    try {
      if (!publicKey || !tokenMint || !connected) {
        setBalance(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      if (isSOL) {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        if (reqId !== reqIdRef.current) return;
        setBalance({ amount: lamports / 1e9, decimals: 9 });
        return;
      }

      const mintPk = new PublicKey(tokenMint);
      const [mintInfo, ata] = await Promise.all([
        getMint(connection, mintPk, 'confirmed'),
        getAssociatedTokenAddress(mintPk, publicKey),
      ]);

      try {
        const acc = await getAccount(connection, ata, 'confirmed');
        const raw = acc.amount.toString();
        const ui = Number(rawToUiString(raw, mintInfo.decimals));

        if (reqId !== reqIdRef.current) return;

        setBalance({
          amount: Number.isFinite(ui) ? ui : 0,
          decimals: mintInfo.decimals,
        });
      } catch {
        if (reqId !== reqIdRef.current) return;
        setBalance({ amount: 0, decimals: mintInfo.decimals });
      }
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return;
      setError(e?.message || 'Failed to fetch balance');
      setBalance(null);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [publicKey, tokenMint, isSOL, connected, connection]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, error, refresh, isSOL };
}