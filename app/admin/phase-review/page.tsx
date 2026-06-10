//app/admin/phase-review/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useAdminWalletGuard from '@/hooks/useAdminWalletGuard';

const STATUSES = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

type PhaseTokenRow = {
  phase_id: number;
  phase_no: number;
  phase_name: string;
  phase_status: string;
  mint: string;
  token_symbol: string | null;
  contribution_count: number;
  wallet_count: number;
  usd_total: string | number;
  megy_total: string | number;
  status: TokenStatus;
  yes_count: number;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

const CARD =
  'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[$()*+./?[\\\]^{|}-]/g, '\\$&') + '=([^;]*)')
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  return meta?.content || getCookie('csrf') || null;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getCsrfToken();

  const headers = new Headers(init.headers || {});
  headers.set('X-Requested-With', 'fetch');

  if (token) {
    headers.set('x-csrf-token', token);
  }

  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data as T;
}

function shortMint(v: string) {
  if (!v) return '-';
  return v.length > 14 ? `${v.slice(0, 6)}...${v.slice(-4)}` : v;
}

function fmtUsd(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '-';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtNum(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function statusClass(status: string) {
  if (status === 'healthy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'walking_dead') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'deadcoin') return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200';
  if (status === 'redlist') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'blacklist') return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200';
  return 'border-white/10 bg-white/5 text-white/70';
}

export default function PhaseReviewPage() {
  const searchParams = useSearchParams();
  const initialPhaseId = searchParams.get('phaseId') || '';

  const {
    loading: adminGuardLoading,
    canRunCriticalAdminAction,
    guardMessage,
    walletMatches,
    sessionWallet,
    connectedWallet,
  } = useAdminWalletGuard();

  const [phaseId, setPhaseId] = useState(initialPhaseId);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [review, setReview] = useState<'all' | 'reviewed' | 'unreviewed'>('unreviewed');

  const [items, setItems] = useState<PhaseTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyMint, setBusyMint] = useState<string | null>(null);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (status) sp.set('status', status);
    sp.set('review', review);
    sp.set('limit', '200');
    return sp.toString();
  }, [q, status, review]);

  function ensureCriticalAdminAccess(): boolean {
    if (adminGuardLoading) {
      setMsg('⏳ Checking admin wallet...');
      return false;
    }

    if (!canRunCriticalAdminAction) {
      setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`);
      return false;
    }

    return true;
  }

  async function load() {
    const id = Number(phaseId);

    if (!Number.isFinite(id) || id <= 0) {
      setItems([]);
      setMsg('Enter a valid phase ID.');
      return;
    }

    try {
      setLoading(true);
      setMsg(null);

      const data = await api<{
        success: boolean;
        items: PhaseTokenRow[];
      }>(`/api/admin/phases/${id}/tokens?${params}`);

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setItems([]);
      setMsg(`❌ ${e?.message || 'Load failed'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminGuardLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminGuardLoading, phaseId, params]);

  async function updateStatus(mint: string, nextStatus: TokenStatus) {
    if (!ensureCriticalAdminAccess()) return;

    try {
      setBusyMint(mint);
      setMsg(null);

      await api('/api/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint,
          status: nextStatus,
          reason: `phase review ${phaseId}`,
          meta: {
            source: 'phase_review',
            phase_id: Number(phaseId),
          },
        }),
      });

      setMsg(`✅ ${shortMint(mint)} → ${nextStatus}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Status update failed'}`);
    } finally {
      setBusyMint(null);
    }
  }

  async function markReviewed(mint: string, reviewed: boolean) {
    if (!ensureCriticalAdminAccess()) return;

    try {
      setBusyMint(mint);
      setMsg(null);

      await api(`/api/admin/phases/${Number(phaseId)}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint,
          reviewed,
          note: reviewed ? 'reviewed from phase review panel' : 'unreviewed from phase review panel',
        }),
      });

      setMsg(reviewed ? `✅ Reviewed: ${shortMint(mint)}` : `↩️ Unreviewed: ${shortMint(mint)}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Review update failed'}`);
    } finally {
      setBusyMint(null);
    }
  }

  const summary = useMemo(() => {
    const total = items.length;
    const reviewedCount = items.filter((x) => x.reviewed).length;
    const unreviewedCount = total - reviewedCount;
    const usd = items.reduce((sum, x) => sum + Number(x.usd_total ?? 0), 0);

    return { total, reviewedCount, unreviewedCount, usd };
  }, [items]);

  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Phase Token Review</h1>
            <p className="mt-1 text-xs text-white/60">
              Review tokens coincarned in a selected phase and quickly update their registry status.
            </p>
          </div>

          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {!adminGuardLoading && !walletMatches && (
          <div className={`${CARD} text-sm text-yellow-100 border-yellow-500/20 bg-yellow-500/10`}>
            <div className="font-medium">Admin wallet verification required</div>
            <div className="mt-1 text-xs text-yellow-200/80">
              Critical actions require the connected wallet to match the active admin session wallet.
            </div>
            <div className="mt-2 text-xs text-yellow-200/80 space-y-1">
              {sessionWallet ? <div>Session wallet: {sessionWallet}</div> : null}
              {connectedWallet ? <div>Connected wallet: {connectedWallet}</div> : null}
            </div>
          </div>
        )}

        {msg && <div className={`${CARD} text-sm whitespace-pre-line`}>{msg}</div>}

        <section className={CARD}>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_180px_180px_auto]">
            <div>
              <label className="mb-1 block text-xs text-white/50">Phase ID</label>
              <input
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value.trim())}
                placeholder="32"
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-blue-400/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/50">Search</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="mint or symbol"
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-blue-400/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/50">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
              >
                <option value="">all</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/50">Review</label>
              <select
                value={review}
                onChange={(e) => setReview(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
              >
                <option value="unreviewed">unreviewed</option>
                <option value="reviewed">reviewed</option>
                <option value="all">all</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => void load()}
                disabled={loading}
                className="h-10 w-full rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className={CARD}>
            <div className="text-xs text-white/50">Visible tokens</div>
            <div className="mt-2 text-2xl font-semibold">{summary.total}</div>
          </div>

          <div className={CARD}>
            <div className="text-xs text-white/50">Unreviewed</div>
            <div className="mt-2 text-2xl font-semibold text-yellow-200">{summary.unreviewedCount}</div>
          </div>

          <div className={CARD}>
            <div className="text-xs text-white/50">Reviewed</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200">{summary.reviewedCount}</div>
          </div>

          <div className={CARD}>
            <div className="text-xs text-white/50">Visible USD total</div>
            <div className="mt-2 text-2xl font-semibold">{fmtUsd(summary.usd)}</div>
          </div>
        </section>

        <section className={CARD}>
          {loading ? (
            <div className="text-sm text-white/60">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-white/60">No phase token records found.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-[1280px] w-full text-left text-sm">
                <thead className="bg-white/5 text-white/60">
                  <tr>
                    <th className="px-4 py-3">Review</th>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Mint</th>
                    <th className="px-4 py-3">Contributions</th>
                    <th className="px-4 py-3">Wallets</th>
                    <th className="px-4 py-3">USD</th>
                    <th className="px-4 py-3">MEGY</th>
                    <th className="px-4 py-3">Votes</th>
                    <th className="px-4 py-3">Current Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((row) => {
                    const busy = busyMint === row.mint;

                    return (
                      <tr key={row.mint} className="border-t border-white/10 align-top hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          {row.reviewed ? (
                            <div className="space-y-2">
                              <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                                reviewed
                              </span>
                              <button
                                disabled={busy}
                                onClick={() => markReviewed(row.mint, false)}
                                className="block rounded bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 disabled:opacity-50"
                              >
                                undo
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => markReviewed(row.mint, true)}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                            >
                              Mark Reviewed
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold">{row.token_symbol || 'Unknown'}</div>
                          <div className="mt-1 text-[11px] text-white/45">
                            Phase #{row.phase_no} — {row.phase_name}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs">
                          <button
                            onClick={() => navigator.clipboard?.writeText(row.mint)}
                            className="text-sky-200 hover:underline"
                            title={row.mint}
                          >
                            {shortMint(row.mint)}
                          </button>
                        </td>

                        <td className="px-4 py-3">{row.contribution_count}</td>
                        <td className="px-4 py-3">{row.wallet_count}</td>
                        <td className="px-4 py-3">{fmtUsd(row.usd_total)}</td>
                        <td className="px-4 py-3">{fmtNum(row.megy_total)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-white/10 px-2 py-1 text-xs">
                            YES {row.yes_count}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {STATUSES.map((s) => (
                              <button
                                key={s}
                                disabled={busy || row.status === s}
                                onClick={() => updateStatus(row.mint, s)}
                                className={`rounded-md border px-2 py-1 text-[11px] hover:opacity-90 disabled:opacity-40 ${statusClass(s)}`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}