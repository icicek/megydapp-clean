// app/admin/tokens/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ExportCsvButton from '@/components/admin/ExportCsvButton';

/** ---------- Status typing (single source of truth) ---------- */
const STATUSES = ['healthy','walking_dead','deadcoin','redlist','blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

// Back-compat alias (readonly); istersen kullanmaya devam edebilirsin
const ALLOWED: readonly TokenStatus[] = STATUSES;

// Subtle color mapping for badges/chips (dark theme friendly)
const STATUS_STYLES: Record<TokenStatus, string> = {
  healthy: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700',
  walking_dead: 'bg-amber-900/50 text-amber-200 border border-amber-700',
  deadcoin: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
  redlist: 'bg-rose-900/50 text-rose-200 border border-rose-700',
  blacklist: 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-700',
};
/** ----------------------------------------------------------- */

type AuditRow = {
  mint: string;
  old_status: TokenStatus | null;
  new_status: TokenStatus;
  reason: string | null;
  meta: any;
  updated_by: string | null;
  changed_at: string;
};

/* --------- simple toast system --------- */
type Toast = { id: number; message: string; kind?: 'ok'|'err'|'info' };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, push };
}
function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={[
            'rounded px-3 py-2 text-sm shadow',
            t.kind === 'ok' ? 'bg-green-600 text-white' :
            t.kind === 'err' ? 'bg-red-600 text-white' :
            'bg-gray-800 text-white'
          ].join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
/* --------------------------------------- */

function parseMints(raw: string): string[] {
  return raw.split(/[\s,]+/g).map(s => s.trim()).filter(Boolean);
}
function StatusBadge({ status }: { status: string }) {
  // Beklenmeyen değer gelirse 'healthy'ye düşer
  const isKnown = (STATUSES as readonly string[]).includes(status as any);
  const s = (isKnown ? status : 'healthy') as TokenStatus;

  return (
    <span className={['rounded px-2 py-0.5 text-xs', STATUS_STYLES[s]].join(' ')}>
      {s}
    </span>
  );
}

// cookie-only: no localStorage token; no Authorization header
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin', // send same-origin cookies
    ...init,
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/admin/login');
    }
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export default function AdminTokensPage() {
  const router = useRouter();
  const { toasts, push } = useToasts();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [mint, setMint] = useState('');
  const [setTo, setSetTo] = useState<TokenStatus>('redlist');
  const [error, setError] = useState<string | null>(null);

  // BULK state
  const [bulkList, setBulkList] = useState('');
  const [bulkTo, setBulkTo] = useState<TokenStatus>('redlist');
  const [bulkReason, setBulkReason] = useState('');

  // pagination
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);

  // History modal state
  const [histOpen, setHistOpen] = useState(false);
  const [histMint, setHistMint] = useState<string | null>(null);
  const [histItems, setHistItems] = useState<AuditRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  // Registry stats
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    lastUpdatedAt: string | null;
  } | null>(null);

  // build querystring
  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    sp.set('limit', String(limit));
    sp.set('offset', String(page * limit));
    return sp.toString();
  }, [q, status, limit, page]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{success: true; items: any[]}>(`/api/admin/tokens?${params}`);
      setItems(data.items || []);
    } catch (e: any) {
      const msg = e?.message || 'Load error';
      setError(msg);
      push(msg, 'err');
    } finally {
      setLoading(false);
    }
  }, [params, push]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/registry/stats', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j?.success) setStats(j);
    } catch {
      push('Stats load error', 'err');
    }
  }, [push]);

  // initial loads
  useEffect(() => {
    loadStats();
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load, loadStats]);

  useEffect(() => { setPage(0); }, [q, status, limit]);

  async function setStatusFor(m: string, s: TokenStatus) {
    try {
      setError(null);
      await api('/api/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: m, status: s, reason: 'admin panel' }),
      });
      push(`✅ ${m} → ${s}`, 'ok');
      await load();
      await loadStats();
    } catch (e: any) {
      const msg = e?.message || 'Update error';
      setError(msg);
      push(`❌ ${msg}`, 'err');
    }
  }

  async function resetHealthy(m: string) {
    try {
      setError(null);
      await api(`/api/admin/tokens?mint=${encodeURIComponent(m)}`, { method: 'DELETE' });
      push(`✅ ${m} reset → healthy`, 'ok');
      await load();
      await loadStats();
    } catch (e: any) {
      const msg = e?.message || 'Reset error';
      setError(msg);
      push(`❌ ${msg}`, 'err');
    }
  }

  async function bulkUpdate() {
    try {
      const mints = parseMints(bulkList);
      if (mints.length === 0) { push('Paste at least one mint', 'err'); return; }
      const res = await api<{
        success: true;
        okCount: number;
        failCount: number;
        fail: { mint: string; error: string }[];
      }>(
        '/api/admin/tokens/bulk',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mints,
            status: bulkTo,
            reason: bulkReason || null,
            meta: { from: 'admin_bulk' },
          }),
        }
      );
      push(`✅ Bulk done: ${res.okCount} ok, ${res.failCount} fail`, res.failCount ? 'info' : 'ok');
      if (res.failCount) {
        const sample = res.fail.slice(0, 3).map(f => `${f.mint}: ${f.error}`).join(' | ');
        push(`Some failed: ${sample}`, 'err');
      }
      await load();
      await loadStats();
    } catch (e: any) {
      push(`❌ ${e?.message || 'Bulk error'}`, 'err');
    }
  }

  async function openHistory(mintVal: string) {
    try {
      setHistOpen(true);
      setHistMint(mintVal);
      setHistItems(null);
      setHistLoading(true);
      const data = await api<{ success: true; items: AuditRow[] }>(
        `/api/admin/audit?mint=${encodeURIComponent(mintVal)}&limit=50`
      );
      setHistItems(data.items);
    } catch (e: any) {
      push(e?.message || 'History load error', 'err');
    } finally {
      setHistLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      router.replace('/admin/login');
    }
  }

  const canPrev = page > 0;
  const canNext = items.length === limit;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <ToastViewport toasts={toasts} />

      {/* TOP BAR */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">🛡️ Token Management</h1>
        <button
          onClick={logout}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
        >
          Logout
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by mint"
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
        >
          <option value="">(all)</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
            title="Rows per page"
          >
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}/page</option>)}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-2 font-semibold disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          {/* Export CSV button (filters: q & status) */}
          <ExportCsvButton q={q} status={status || ''} />
        </div>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => canPrev && setPage(p => Math.max(0, p - 1))}
          disabled={!canPrev}
          className="bg-gray-800 disabled:opacity-50 hover:bg-gray-700 border border-gray-600 rounded px-3 py-1"
        >
          ← Prev
        </button>
        <div className="text-sm text-gray-300">Page {page + 1}</div>
        <button
          onClick={() => canNext && setPage(p => p + 1)}
          disabled={!canNext}
          className="bg-gray-800 disabled:opacity-50 hover:bg-gray-700 border border-gray-600 rounded px-3 py-1"
        >
          Next →
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">Quick Update</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Mint address"
            className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2"
          />
          <select
            value={setTo}
            onChange={(e) => setSetTo(e.target.value as TokenStatus)}
            className="bg-gray-950 border border-gray-700 rounded px-3 py-2"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => {
              if (!mint) { push('Mint cannot be empty', 'err'); return; }
              setStatusFor(mint, setTo);
            }}
            className="bg-purple-600 hover:bg-purple-700 rounded px-3 py-2 font-semibold"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">Bulk Update</h2>
        <p className="text-gray-400 text-sm mb-3">Paste mint addresses (one per line, comma or whitespace separated).</p>
        <div className="flex flex-col gap-3">
          <textarea
            value={bulkList}
            onChange={(e) => setBulkList(e.target.value)}
            placeholder={`Ex:\nMINT1\nMINT2\nMINT3`}
            className="min-h-[140px] bg-gray-950 border border-gray-700 rounded px-3 py-2 font-mono"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value as TokenStatus)}
              className="bg-gray-950 border border-gray-700 rounded px-3 py-2"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Optional reason"
              className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2"
            />
            <button
              onClick={bulkUpdate}
              className="bg-amber-600 hover:bg-amber-700 rounded px-3 py-2 font-semibold"
            >
              Apply to list
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-red-400 mb-4">❌ {error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="text-left p-2">Mint</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Updated By</th>
              <th className="text-left p-2">Status At</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td className="p-3 text-gray-400" colSpan={5}>No records</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.mint} className="border-b border-gray-800">
                <td className="p-2 font-mono">{it.mint}</td>
                <td className="p-2">
                  <StatusBadge status={it.status} />
                </td>
                <td className="p-2">{it.updated_by ?? '—'}</td>
                <td className="p-2">{it.status_at ? new Date(it.status_at).toLocaleString() : '—'}</td>
                <td className="p-2 flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFor(it.mint, s)}
                      className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => resetHealthy(it.mint)}
                    className="bg-green-700 hover:bg-green-600 rounded px-2 py-1"
                  >
                    reset → healthy
                  </button>
                  <button
                    onClick={() => openHistory(it.mint)}
                    className="bg-indigo-700 hover:bg-indigo-600 rounded px-2 py-1"
                  >
                    history
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Registry Stats (framed, at the bottom) */}
      {stats && (
        <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6 mt-6">
          <h2 className="font-semibold mb-2">Registry Stats</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="bg-gray-950 border border-gray-800 rounded p-3">
              <div className="text-xs text-gray-400">Total tokens</div>
              <div className="text-xl font-semibold">{stats.total}</div>
            </div>
            <div className="bg-gray-950 border border-gray-800 rounded p-3">
              <div className="text-xs text-gray-400">By status</div>
              <div className="flex flex-wrap gap-2 mt-1 text-sm">
                {STATUSES.map((s) => (
                  <span key={s} className={['rounded px-2 py-0.5', STATUS_STYLES[s]].join(' ')}>
                    {s}: {stats.byStatus?.[s] ?? 0}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-gray-950 border border-gray-800 rounded p-3">
              <div className="text-xs text-gray-400">Last updated</div>
              <div className="text-sm">
                {stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {histOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-[90vw] max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div className="font-semibold">
                History — <span className="font-mono">{histMint}</span>
              </div>
              <button
                onClick={() => setHistOpen(false)}
                className="text-gray-300 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto">
              {histLoading && <div className="text-sm text-gray-400">Loading…</div>}
              {!histLoading && (!histItems || histItems.length === 0) && (
                <div className="text-sm text-gray-400">No history</div>
              )}
              {!histLoading && histItems && histItems.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left p-2">Changed At</th>
                      <th className="text-left p-2">Old → New</th>
                      <th className="text-left p-2">Updated By</th>
                      <th className="text-left p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histItems.map((h, idx) => (
                      <tr key={idx} className="border-t border-gray-800">
                        <td className="p-2">{new Date(h.changed_at).toLocaleString()}</td>
                        <td className="p-2">
                          {(h.old_status ?? '—')} → <span className="font-semibold">{h.new_status}</span>
                        </td>
                        <td className="p-2">{h.updated_by ?? '—'}</td>
                        <td className="p-2">{h.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
