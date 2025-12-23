// components/admin/TokenInfoModal.tsx
'use client';

import React, { useEffect } from 'react';

export type VolumeResp = {
  mint?: string;
  dexVolumeUSD: number | null;
  dexLiquidityUSD: number | null;
  cexVolumeUSD: number | null;
  totalVolumeUSD: number | null;
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
  onRetry: () => void;
};

function fmt(n: number | null | undefined) {
  const x = typeof n === 'number' ? n : 0;
  return '$' + x.toLocaleString();
}

function MetricCard({
  label,
  value,
  foot,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div
      className="
        bg-gray-950 border border-gray-800 rounded-xl
        p-3 sm:p-4
        h-28 sm:h-32
        overflow-hidden
        flex flex-col justify-between
        shadow-sm
      "
    >
      <div className="text-[11px] sm:text-xs text-gray-400 truncate">{label}</div>
      <div
        className="
          text-base sm:text-lg font-semibold
          tabular-nums
          leading-tight select-text
          break-words
        "
      >
        {value}
      </div>
      {foot ? (
        <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1 truncate">{foot}</div>
      ) : (
        <div className="h-[12px]" />
      )}
    </div>
  );
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
  // ESC → close
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
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="
            w-[92vw] max-w-lg
            bg-gray-900 border border-gray-700 rounded-2xl
            overflow-hidden
            text-white
            tabular-nums
            shadow-2xl
          "
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between min-h-[56px]">
            <div className="font-semibold">
              Volume & Liquidity
              {mint ? (
                <>
                  {' — '}
                  <span className="font-mono text-xs text-gray-300">{mint}</span>
                </>
              ) : null}
              {mint ? (
                <div className="mt-1 text-[11px] text-gray-400 flex gap-3 font-normal">
                  <a
                    href={`https://dexscreener.com/search?q=${encodeURIComponent(mint)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline underline-offset-2"
                  >
                    Dexscreener
                  </a>
                  <a
                    href={`https://www.coingecko.com/en/search?query=${encodeURIComponent(mint)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline underline-offset-2"
                  >
                    CoinGecko
                  </a>
                </div>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="h-9 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 space-y-3">
            {loading && <div className="text-sm text-gray-400">Loading…</div>}
            {!loading && error && (
              <div className="flex items-center justify-between gap-3 bg-rose-900/30 border border-rose-800 rounded-lg p-3 text-sm">
                <span>❌ {error}</span>
                <button
                  onClick={onRetry}
                  className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* Top row: DEX & CEX */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <MetricCard
                    label="DEX Volume (24h)"
                    value={fmt(data.dexVolumeUSD)}
                    foot={<span>src: {data.dexSource}</span>}
                  />
                  <MetricCard
                    label="CEX Volume (24h)"
                    value={fmt(data.cexVolumeUSD)}
                    foot={<span>src: {data.cexSource}</span>}
                  />
                </div>

                {/* Bottom row: Total & Max Liquidity */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <MetricCard label="Total Volume (24h)" value={fmt(data.totalVolumeUSD)} />
                  <MetricCard
                    label="Max Pool Liquidity"
                    value={fmt(data.dexLiquidityUSD)}
                  />
                </div>

                {/* footnote */}
                <div className="text-[11px] text-gray-500">
                  Total = DEX + (CEX if enabled in settings). Sources are best-effort and cached briefly.
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={onClose}
              className="
                w-full h-10
                rounded-xl
                bg-gray-800 hover:bg-gray-700
                border border-gray-700
                text-sm font-medium
                transition-colors
              "
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
