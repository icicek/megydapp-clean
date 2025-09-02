// app/admin/control/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// basit fetch helper’ları
async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function sendJSON<T>(url: string, method: 'POST'|'PUT', body: any): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
type BoolConfigResponse = { success: boolean; value: unknown };

const asBool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1';
  }
  return false;
};


export default function AdminControlPage() {
  const [whoami, setWhoami] = useState<string | null>(null);

  // toggles
  const [claimOpen, setClaimOpen] = useState<boolean | null>(null);
  const [appEnabled, setAppEnabled] = useState<boolean | null>(null);

  // pool
  const [pool, setPool] = useState<string>('');      // text input
  const poolNumber = useMemo(() => Number(pool), [pool]);

  // admins
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // bazı endpointler projende yoksa (404) kartları gizleyelim
  const [hasAppEnabled, setHasAppEnabled] = useState(true);
  const [hasAdminsCfg, setHasAdminsCfg] = useState(true);

  // ilk yükleme
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // whoami → wallet
        try {
          const w = await getJSON<{ success: boolean; wallet?: string }>('/api/admin/whoami');
          setWhoami(w?.wallet ?? null);
        } catch { setWhoami(null); }

        // claim_open
        try {
            const resp = await getJSON<BoolConfigResponse>('/api/admin/config/claim_open');
            setClaimOpen(asBool(resp?.value));
        } catch {
            setClaimOpen(null);
        }
        
        // app_enabled (opsiyonel)
        try {
            const resp = await getJSON<BoolConfigResponse>('/api/admin/config/app_enabled');
            setAppEnabled(asBool(resp?.value));
            setHasAppEnabled(true);
        } catch {
            setHasAppEnabled(false);
            setAppEnabled(null);
        }
  
        // distribution_pool
        try {
          const dp = await getJSON<{ success: boolean; value: number }>('/api/admin/config/distribution_pool');
          setPool(String(dp?.value ?? ''));
        } catch { setPool(''); }

        // admins (opsiyonel)
        try {
          const ad = await getJSON<{ success: boolean; wallets: string[] }>('/api/admin/config/admins');
          setAdmins(Array.isArray(ad?.wallets) ? ad.wallets : []);
          setHasAdminsCfg(true);
        } catch {
          setHasAdminsCfg(false);
          setAdmins([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleClaim(next: boolean) {
    setMsg(null);
    try {
      // bu route sende wallet istiyordu; whoami yoksa fallback boş kalsın
      await sendJSON('/api/admin/config/claim_open', 'POST', {
        wallet: whoami,
        value: String(next),
      });
      setClaimOpen(next);
      setMsg('✅ Claim setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Claim save failed'}`);
    }
  }

  async function toggleApp(next: boolean) {
    setMsg(null);
    try {
      await sendJSON('/api/admin/config/app_enabled', 'POST', { value: String(next) });
      setAppEnabled(next);
      setMsg('✅ App enabled setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'App enabled save failed'}`);
    }
  }

  async function savePool() {
    setMsg(null);
    if (!Number.isFinite(poolNumber)) { setMsg('❌ Enter a valid number'); return; }
    try {
      await sendJSON('/api/admin/config/distribution_pool', 'PUT', { value: poolNumber });
      setMsg('✅ Distribution pool saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Pool save failed'}`);
    }
  }

  async function saveAdmins(next: string[]) {
    setMsg(null);
    try {
      await sendJSON('/api/admin/config/admins', 'PUT', { wallets: next });
      setAdmins(next);
      setNewAdmin('');
      setMsg('✅ Admin wallets saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Admins save failed'}`);
    }
  }

  function addAdmin() {
    const v = newAdmin.trim();
    if (!v) return;
    if (admins.includes(v)) { setNewAdmin(''); return; }
    saveAdmins([...admins, v]);
  }
  function removeAdmin(w: string) {
    saveAdmins(admins.filter(x => x !== w));
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8 text-white">
      {/* header: karşılıklı geçiş */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-semibold">Control</h1>
        <Link
          href="/admin/tokens"
          className="px-3 py-1 rounded border border-gray-600 bg-gray-800 hover:bg-gray-700 text-sm"
        >
          Tokens
        </Link>
      </div>

      {msg && <div className="text-sm">{msg}</div>}
      {loading && <div className="text-sm text-gray-400">Loading…</div>}

      {/* Claim toggle */}
      <section className="rounded-xl border border-gray-700 bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Claim Panel</div>
            <div className="text-xs text-gray-400">Enable/disable public claiming</div>
          </div>
          <label className="inline-flex items-center gap-3">
            <span className="text-sm">{claimOpen ? 'Open' : 'Closed'}</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={!!claimOpen}
              onChange={(e) => toggleClaim(e.target.checked)}
            />
          </label>
        </div>
      </section>

      {/* App enabled toggle (opsiyonel) */}
      {hasAppEnabled && (
        <section className="rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">App Enabled</div>
              <div className="text-xs text-gray-400">Global kill-switch for write ops</div>
            </div>
            <label className="inline-flex items-center gap-3">
              <span className="text-sm">{appEnabled ? 'Enabled' : 'Disabled'}</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!!appEnabled}
                onChange={(e) => toggleApp(e.target.checked)}
              />
            </label>
          </div>
        </section>
      )}

      {/* Distribution pool */}
      <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
        <div className="font-semibold">Distribution Pool</div>
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            className="w-48 rounded bg-gray-950 border border-gray-700 px-2 py-1"
            placeholder="0"
          />
          <button
            onClick={savePool}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700"
          >
            Save
          </button>
        </div>
        <div className="text-[11px] text-gray-400">
          Total MEGY amount to be distributed in the current snapshot.
        </div>
      </section>

      {/* Admin wallets (opsiyonel) */}
      {hasAdminsCfg && (
        <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
          <div className="font-semibold">Admin Wallets</div>

          {admins.length === 0 ? (
            <div className="text-sm text-gray-400">No admins set yet.</div>
          ) : (
            <ul className="space-y-2">
              {admins.map((w) => (
                <li key={w} className="flex items-center justify-between">
                  <span className="font-mono text-sm">{w}</span>
                  <button
                    onClick={() => removeAdmin(w)}
                    className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-sm"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newAdmin}
              onChange={(e) => setNewAdmin(e.target.value)}
              placeholder="New admin wallet (base58)"
              className="flex-1 rounded bg-gray-950 border border-gray-700 px-2 py-1"
            />
            <button
              onClick={addAdmin}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700"
            >
              Add
            </button>
          </div>
          <div className="text-[11px] text-gray-400">
            This updates the DB allowlist used by login verification.
          </div>
        </section>
      )}
    </main>
  );
}
