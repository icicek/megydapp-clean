// lib/useClaimPreview.ts
import { useEffect, useState } from 'react';

type PreviewResponse = {
  success: boolean;
  pool: number;
  share: number;
  amount: number; // pool-mode MEGY
  mode?: {
    pool: { pool: number; share: number; amount: number };
    rate: { rate: number; userUsd: number; amount: number }; // rate-mode MEGY
  };
};

export function useClaimPreview(wallet?: string | null) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!wallet);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!wallet) { setLoading(false); setData(null); return; }
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/claim/preview?wallet=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) setData(json?.success ? json : null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [wallet]);

  const poolAmount = data?.mode?.pool?.amount ?? data?.amount ?? null;
  const rateInfo = data?.mode?.rate ?? null; // { rate, userUsd, amount }
  return { data, loading, error, poolAmount, rateInfo };
}
