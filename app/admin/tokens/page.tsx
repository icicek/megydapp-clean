// app/admin/tokens/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';

const ALLOWED: TokenStatus[] = ['healthy','walking_dead','deadcoin','redlist','blacklist'];

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

// cookie-only: no localStorage token; no Authorization header
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin', // send same-origin cookies
    ...init,
  });
  if (!res.ok) {
    // if unauthorized, bounce to login
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.assign('/admin/login');
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

  // pagination
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);

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

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

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
    } catch (e: any) {
      const msg = e?.message || 'Reset error';
      setError(msg);
      push(`❌ ${msg}`, 'err');
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
          {ALLOWED.map(s => <option key={s} value={s}>{s}</option>)}
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
            className="flex-1 bg-blue-600 hover:bg-blue-700 rounded px-3 py-2 font-semibold disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
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
            {ALLOWED.map(s => <option key={s} value={s}>{s}</option>)}
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
                <td className="p-2">{it.status}</td>
                <td className="p-2">{it.updated_by ?? '—'}</td>
                <td className="p-2">{it.status_at ? new Date(it.status_at).toLocaleString() : '—'}</td>
                <td className="p-2 flex flex-wrap gap-2">
                  {ALLOWED.map(s => (
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
