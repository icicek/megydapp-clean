// app/admin/control/page.tsx
'use client';
import { useEffect, useState } from 'react';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || res.statusText);
  return data as T;
}

// Tek tipli yardımcı: her zaman RequestInit döndürür
const withCsrf = (init: RequestInit = {}): RequestInit => ({
  ...init,
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  },
});

export default function AdminControlPage() {
  const [claimOpen, setClaimOpen] = useState<'true'|'false'>('false');
  const [appEnabled, setAppEnabled] = useState<'true'|'false'>('true');
  const [pool, setPool] = useState<string>('');
  const [envAdmins, setEnvAdmins] = useState<string[]>([]);
  const [extraAdmins, setExtraAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');

  const loadAll = async () => {
    const [c, a, d, ad] = await Promise.all([
      api<{success:true; value:string}>('/api/admin/config/claim_open'),
      api<{success:true; value:string}>('/api/admin/config/app_enabled'),
      api<{success:true; value:number}>('/api/admin/config/distribution_pool'),
      api<{success:true; env:string[]; extra:string[]}>('/api/admin/admins'),
    ]);
    setClaimOpen(c.value === 'true' ? 'true' : 'false');
    setAppEnabled(a.value === 'true' ? 'true' : 'false');
    setPool(String(d.value ?? ''));
    setEnvAdmins(ad.env || []);
    setExtraAdmins(ad.extra || []);
  };

  useEffect(() => { loadAll().catch(console.error); }, []);

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Admin Controls</h1>

      {/* Claim toggle */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Claim</h2>
        <div className="flex items-center gap-3">
          <label className="font-mono">claim_open = {claimOpen}</label>
          <button
            className="px-3 py-1 rounded-lg border"
            onClick={async () => {
              const next = claimOpen === 'true' ? 'false' : 'true';
              await api('/api/admin/config/claim_open', withCsrf({
                method: 'POST',
                body: JSON.stringify({ value: next }),
              }));
              setClaimOpen(next);
            }}
          >
            Toggle
          </button>
        </div>
      </section>

      {/* App enabled */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">App (Global)</h2>
        <div className="flex items-center gap-3">
          <label className="font-mono">app_enabled = {appEnabled}</label>
          <button
            className="px-3 py-1 rounded-lg border"
            onClick={async () => {
              const next = appEnabled === 'true' ? 'false' : 'true';
              await api('/api/admin/config/app_enabled', withCsrf({
                method: 'POST',
                body: JSON.stringify({ value: next }),
              }));
              setAppEnabled(next);
            }}
          >
            Toggle
          </button>
        </div>
      </section>

      {/* Distribution pool */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Distribution Pool</h2>
        <div className="flex items-center gap-2">
          <input
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            className="border rounded px-2 py-1 w-40"
            placeholder="amount"
          />
          <button
            className="px-3 py-1 rounded-lg border"
            onClick={async () => {
              const v = Number(pool);
              if (!Number.isFinite(v) || v <= 0) { alert('positive number'); return; }
              await api('/api/admin/config/distribution_pool', withCsrf({
                method: 'PUT',
                body: JSON.stringify({ value: v }),
              }));
              await loadAll();
            }}
          >
            Save
          </button>
        </div>
      </section>

      {/* Admin wallets */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Admin Wallets</h2>
        <p className="text-sm">ENV (read-only):</p>
        <div className="text-xs font-mono border rounded-lg p-2">
          {envAdmins.join(', ') || '—'}
        </div>

        <p className="text-sm">Extra admins (DB):</p>
        <div className="text-xs font-mono border rounded-lg p-2">
          {extraAdmins.join(', ') || '—'}
        </div>

        <div className="flex items-center gap-2">
          <input
            className="border rounded px-2 py-1 flex-1"
            placeholder="base58 wallet"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
          />
          <button
            className="px-3 py-1 rounded-lg border"
            onClick={() => {
              const w = newAdmin.trim();
              if (!/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(w)) { alert('invalid base58'); return; }
              setExtraAdmins((prev) => Array.from(new Set([...prev, w])));
              setNewAdmin('');
            }}
          >
            Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {extraAdmins.map((w) => (
            <button
              key={w}
              className="text-xs border rounded-full px-2 py-1"
              onClick={() => setExtraAdmins((prev) => prev.filter((x) => x !== w))}
              title="remove"
            >
              {w} ✕
            </button>
          ))}
        </div>

        <div>
          <button
            className="mt-2 px-3 py-1 rounded-lg border"
            onClick={async () => {
              await api('/api/admin/admins', withCsrf({
                method: 'PUT',
                body: JSON.stringify({ wallets: extraAdmins }),
              }));
              await loadAll();
            }}
          >
            Save Admins
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Login kontrolü ENV ∪ DB ile yapılır (ikisi de boşsa fail-closed).
        </p>
      </section>
    </main>
  );
}
