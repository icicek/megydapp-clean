'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';

const TOKEN_KEY = 'coincarnation_admin_token';
const ALLOWED: TokenStatus[] = ['healthy','walking_dead','deadcoin','redlist','blacklist'];

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export default function AdminTokensPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [mint, setMint] = useState('');
  const [setTo, setSetTo] = useState<TokenStatus>('redlist');
  const [error, setError] = useState<string | null>(null);

  // guard: token yoksa login'e gönder
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) router.replace('/admin/login');
  }, [router]);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    sp.set('limit', '50');
    return sp.toString();
  }, [q, status]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{success: true; items: any[]}>(`/api/admin/tokens?${params}`);
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 300); // basit debounce
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function setStatusFor(m: string, s: TokenStatus) {
    try {
      setError(null);
      await api('/api/admin/tokens', {
        method: 'POST',
        body: JSON.stringify({ mint: m, status: s, reason: 'admin panel' }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Update error');
    }
  }

  async function resetHealthy(m: string) {
    try {
      setError(null);
      await api(`/api/admin/tokens?mint=${encodeURIComponent(m)}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Reset error');
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold mb-4">🛡️ Token Yönetimi</h1>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara: mint"
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
        >
          <option value="">(tümü)</option>
          {ALLOWED.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-2 font-semibold"
        >
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">Hızlı Güncelle</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Mint adresi"
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
            onClick={() => mint && setStatusFor(mint, setTo)}
            className="bg-purple-600 hover:bg-purple-700 rounded px-3 py-2 font-semibold"
          >
            Uygula
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
              <tr><td className="p-3 text-gray-400" colSpan={5}>Kayıt yok</td></tr>
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
