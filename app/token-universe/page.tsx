//app/token-universe/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

const STATUSES = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

type TokenRow = {
  mint: string;
  status: TokenStatus;
  status_at: string | null;
  updated_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  symbol: string | null;
  name: string | null;
  logo_uri: string | null;
  classification_label: string;
};

const STATUS_STYLES: Record<TokenStatus, string> = {
  healthy: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700',
  walking_dead: 'bg-amber-900/50 text-amber-200 border border-amber-700',
  deadcoin: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
  redlist: 'bg-rose-900/50 text-rose-200 border border-rose-700',
  blacklist: 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-700',
};

function StatusBadge({ status }: { status: TokenStatus }) {
  return (
    <span className={['rounded px-2 py-0.5 text-xs', STATUS_STYLES[status]].join(' ')}>
      {status}
    </span>
  );
}

function shortenMint(mint: string) {
  return `${mint.slice(0, 6)}…${mint.slice(-6)}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function getCoincarnateButtonClass(status: TokenStatus, disabled: boolean) {
  if (disabled) {
    if (status === 'redlist') {
      return 'cursor-not-allowed opacity-60 text-rose-200 border border-rose-500/20 bg-gradient-to-r from-rose-900/40 to-rose-700/20';
    }
    if (status === 'blacklist') {
      return 'cursor-not-allowed opacity-60 text-fuchsia-200 border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-950/40 to-fuchsia-800/20';
    }
    return 'cursor-not-allowed opacity-60 text-gray-400 border border-white/10 bg-white/5';
  }

  if (status === 'healthy') {
    return 'text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-[0_0_20px_rgba(16,185,129,0.18)]';
  }

  if (status === 'walking_dead') {
    return 'text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.18)]';
  }

  if (status === 'deadcoin') {
    return 'text-white bg-gradient-to-r from-zinc-600 to-zinc-500 hover:from-zinc-500 hover:to-zinc-400 shadow-[0_0_20px_rgba(113,113,122,0.18)]';
  }

  return 'text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400';
}

function handleCoincarnateClick(mint: string, status: TokenStatus) {
  if (status === 'redlist' || status === 'blacklist') return;

  try {
    sessionStorage.setItem('coincarnate_target_mint', mint);
  } catch {}

  window.location.href = '/';
}

export default function TokenUniversePage() {
  const [items, setItems] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (status) sp.set('status', status);
    sp.set('limit', String(limit));
    sp.set('offset', String(page * limit));
    return sp.toString();
  }, [q, status, limit, page]);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/token-universe?${params}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const j = await res.json();

      setItems(j.items || []);
      setTotal(j.total || 0);
    } catch (e: any) {
      setError(e?.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 200);

    return () => clearTimeout(id);
  }, [params]);

  useEffect(() => {
    setPage(0);
  }, [q, status, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[#090d15] text-white px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold">Token Universe</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-300">
            Explore the tokens tracked by Coincarnation. Review their current status,
            search by mint or symbol, and decide what deserves a second life.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-cyan-500/10 bg-cyan-500/5 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <h2 className="text-lg font-semibold text-white">How classification works</h2>
              <p className="mt-2 text-sm text-gray-300">
                Tokens are classified using Coincarnation’s current status logic. Healthy tokens meet stronger
                activity expectations, walking dead tokens show weakening conditions, and deadcoins fall below
                survivability thresholds. Redlist and blacklist statuses are policy overrides and Coincarnation
                is disabled for them.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 min-w-[240px]">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <span className="font-semibold">Healthy</span> — strong enough to stay alive
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <span className="font-semibold">Walking Dead</span> — weakening but not gone
              </div>
              <div className="rounded-xl border border-zinc-500/20 bg-zinc-500/10 px-3 py-2 text-xs text-zinc-200">
                <span className="font-semibold">Deadcoin</span> — below survival expectations
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                <span className="font-semibold">Redlist / Blacklist</span> — Coincarnation disabled
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by mint, symbol, or name"
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TokenStatus | '')}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 flex items-center justify-between text-sm text-gray-400">
          <div>{loading ? 'Loading…' : `${total} token(s) found`}</div>
          <button
            onClick={() => void load()}
            className="rounded border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="p-3 text-left">Token</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Classification</th>
                <th className="p-3 text-left">Updated</th>
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="p-4 text-gray-400">
                    No records found.
                  </td>
                </tr>
              )}

              {items.map((it) => {
                const isDisabled = it.status === 'redlist' || it.status === 'blacklist';
                const tokenLabel = it.symbol ? `$${it.symbol}` : 'this token';

                return (
                  <tr key={it.mint} className="border-t border-white/5">
                    <td className="p-3">
                      <div className="flex items-start gap-3">
                        {it.logo_uri ? (
                          <img
                            src={it.logo_uri}
                            alt={it.symbol || it.name || it.mint}
                            className="mt-0.5 h-10 w-10 rounded-full border border-white/10 object-cover"
                          />
                        ) : (
                          <div className="mt-0.5 h-10 w-10 rounded-full border border-white/10 bg-white/5" />
                        )}

                        <div className="min-w-0">
                          <div className="font-semibold">
                            {it.symbol || 'Unknown Symbol'}
                            {it.name ? ` — ${it.name}` : ''}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="font-mono text-xs text-gray-400" title={it.mint}>
                                {shortenMint(it.mint)}
                            </div>

                            <button
                                onClick={async () => {
                                  await copyToClipboard(it.mint);
                                }}
                                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-white/10 hover:text-white"
                                title="Copy mint"
                                aria-label="Copy mint"
                            >
                                copy
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <StatusBadge status={it.status} />
                    </td>

                    <td className="p-3">
                      <span className="inline-flex rounded px-2 py-1 text-xs border border-white/10 bg-white/5 text-gray-200">
                        {it.classification_label}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap text-gray-300">
                      {it.updated_at ? new Date(it.updated_at).toLocaleString() : '—'}
                    </td>

                    <td className="p-3">
                      <button
                        disabled={isDisabled}
                        onClick={() => handleCoincarnateClick(it.mint, it.status)}
                        className={[
                          'w-[220px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 text-center',
                          getCoincarnateButtonClass(it.status, isDisabled),
                        ].join(' ')}
                        title={
                          isDisabled
                            ? 'Coincarnation is disabled for redlisted or blacklisted tokens.'
                            : `Coincarnate ${tokenLabel}`
                        }
                      >
                        {it.symbol ? `Coincarnate $${it.symbol}` : 'Coincarnate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-400">
            Page {page + 1} / {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-white/10 bg-white/5 px-3 py-2 disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages}
              className="rounded border border-white/10 bg-white/5 px-3 py-2 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}