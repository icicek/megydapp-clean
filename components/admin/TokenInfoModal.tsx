// components/admin/TokenInfoModal.tsx
'use client';

import React, { useEffect } from 'react';

export type VolumeResp = {
  success: boolean;
  mint: string;
  dexVolumeUSD: number | null;
  cexVolumeUSD: number | null;
  totalVolumeUSD: number | null;
  dexLiquidityUSD: number | null;
  dexSource: 'dexscreener' | 'geckoterminal' | 'none';
  cexSource: 'coingecko' | 'none';
};

type Props = {
  open: boolean;
  mint: string | null;
  loading: boolean;
  data: VolumeResp | null;
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
};

function fmtUSD(n: number | null | undefined) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  try {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return String(v);
  }
}

export default function TokenInfoModal({
  open,
  mint,
  loading,
  data,
  error,
  onClose,
  onRetry,
}: Props) {
  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3"
      aria-modal="true"
      role="dialog"
    >
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div
        className="relative w-[92vw] max-w-2xl bg-[#0f172a] text-white border border-white/10 rounded-2xl shadow-2xl"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
      >
        {/* header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-start gap-3">
          <div className="text-lg font-semibold tracking-tight">
            Volume &amp; Liquidity —{' '}
            <span className="font-mono text-sm align-middle break-all">
              {mint ?? '—'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="p-5 space-y-3">
          {loading && (
            <div className="text-sm text-gray-300">Loading…</div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-rose-700/50 bg-rose-900/30 text-rose-100 p-3 text-sm">
              ❌ {error}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="ml-3 px-2 py-0.5 rounded bg-rose-700/70 hover:bg-rose-700 text-white text-xs"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {/* DEX */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                    DEX Volume (24h)
                  </div>
                  <div className="text-xl font-semibold leading-none">
                    ${fmtUSD(data.dexVolumeUSD)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    src: {data.dexSource}
                  </div>
                </div>

                {/* CEX */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                    CEX Volume (24h)
                  </div>
                  <div className="text-xl font-semibold leading-none">
                    ${fmtUSD(data.cexVolumeUSD)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    src: {data.cexSource}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                  Total Volume (24h)
                </div>
                <div className="text-2xl font-semibold leading-none">
                  ${fmtUSD(data.totalVolumeUSD)}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                  Max Pool Liquidity
                </div>
                <div className="text-xl font-semibold leading-none">
                  ${fmtUSD(data.dexLiquidityUSD)}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12px] text-gray-300">
                * DEX verisi tek bir kaynak önceliği ile toplanır (çift sayım yok). CEX toplamı CoinGecko allowlist’e göre hesaplanır. Değerler anlık sorgudan gelir ve kısa süreli cache uygulanır.
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
