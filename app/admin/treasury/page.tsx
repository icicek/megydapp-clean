//app/admin/treasury/page.tsx

'use client';

import { useEffect, useState } from 'react';

type Asset = {
  mint: string;
  amount: string;
  decimals: number;
  tokenAccounts: number;
  program: 'spl-token' | 'token-2022';
};

type Overview = {
  success: boolean;
  treasury: string;
  solLamports: string;
  assets: Asset[];
  totalAssets: number;
  scannedAt: string;
  mode: string;
};

function formatAmount(raw: string, decimals: number) {
  try {
    const value = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);

    const whole = value / divisor;
    const fraction = (value % divisor)
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');

    return fraction
      ? `${whole.toLocaleString()}.${fraction.slice(0, 8)}`
      : whole.toLocaleString();
  } catch {
    return raw;
  }
}

export default function TreasuryPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/treasury/overview', {
        credentials: 'include',
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load treasury');
      }

      setData(json);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unknown error'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 md:px-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Coincarnation Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Treasury Engine
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Ledger treasury inventory · Read-only scanner
          </p>
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/20 disabled:opacity-50"
        >
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <p className="text-xs text-zinc-400">
                Token Assets
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {data.totalAssets}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <p className="text-xs text-zinc-400">
                SOL Balance
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {formatAmount(data.solLamports, 9)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <p className="text-xs text-zinc-400">
                Scanner Status
              </p>
              <p className="mt-2 text-lg font-bold text-emerald-400">
                Read-only
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Treasury Wallet
            </p>
            <p className="mt-2 break-all font-mono text-sm text-zinc-200">
              {data.treasury}
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Last scan: {new Date(data.scannedAt).toLocaleString()}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold text-white">
                Treasury Assets
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Live token balances from Solana RPC
              </p>
            </div>

            {data.assets.length === 0 ? (
              <p className="p-6 text-sm text-zinc-400">
                No non-zero token balances found.
              </p>
            ) : (
              <div className="divide-y divide-white/5">
                {data.assets.map((asset) => (
                  <div
                    key={`${asset.program}:${asset.mint}`}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-white">
                        {asset.mint.slice(0, 8)}...
                        {asset.mint.slice(-6)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {asset.program} · {asset.tokenAccounts} account(s)
                      </p>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(asset.mint)
                        }
                        className="mt-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        Copy mint
                      </button>
                    </div>

                    <div className="sm:text-right">
                      <p className="text-lg font-semibold text-white">
                        {formatAmount(asset.amount, asset.decimals)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Token balance
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!data && loading && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
          Reading treasury balances...
        </div>
      )}
    </main>
  );
}
