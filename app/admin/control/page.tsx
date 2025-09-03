// app/admin/control/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// ---- CSRF helpers (pasif: token varsa header ekler) ----
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

// ---- fetch helpers ----
async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function sendJSON<T>(url: string, method: 'POST' | 'PUT', body: any): Promise<T> {
  const token = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };
  if (token) headers['x-csrf-token'] = token;

  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers,
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

  // saving flags (UX)
  const [savingClaim, setSavingClaim] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [savingAdmins, setSavingAdmins] = useState(false);

  // pool
  const [pool, setPool] = useState<string>(''); // text input
  const poolNumber = useMemo(() => Number(pool), [pool]);

  // admins
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // optional endpoints guard
  const [hasAppEnabled, setHasAppEnabled] = useState(true);
  const [hasAdminsCfg, setHasAdminsCfg] = useState(true);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // whoami
        try {
          const w = await getJSON<{ success: boolean; wallet?: string }>('/api/admin/whoami');
          setWhoami(w?.wallet ?? null);
        } catch {
          setWhoami(null);
        }

        // claim_open
        try {
          const resp = await getJSON<BoolConfigResponse>('/api/admin/config/claim_open');
          setClaimOpen(asBool(resp?.value));
        } catch {
          setClaimOpen(null);
        }

        // app_enabled (optional)
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
        } catch {
          setPool('');
        }

        // admins (optional)
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
    setSavingClaim(true);
    try {
      // bu route sende wallet istiyordu; whoami yoksa boş gider (backend requireAdmin'e geçersen body'den kaldırabiliriz)
      await sendJSON('/api/admin/config/claim_open', 'POST', {
        wallet: whoami,
        value: String(next),
      });
      setClaimOpen(next);
      setMsg('✅ Claim setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Claim save failed'}`);
    } finally {
      setSavingClaim(false);
    }
  }

  async function toggleApp(next: boolean) {
    setMsg(null);
    setSavingApp(true);
    try {
      await sendJSON('/api/admin/config/app_enabled', 'POST', { value: String(next) });
      setAppEnabled(next);
      setMsg('✅ App enabled setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'App enabled save failed'}`);
    } finally {
      setSavingApp(false);
    }
  }

  async function savePool() {
    setMsg(null);
    setSavingPool(true);
    if (pool.trim() === '') {
      setMsg('❌ Enter a value');
      setSavingPool(false);
      return;
    }
    if (!Number.isFinite(poolNumber)) {
      setMsg('❌ Enter a valid number');
      setSavingPool(false);
      return;
    }
    try {
      await sendJSON('/api/admin/config/distribution_pool', 'PUT', { value: poolNumber });
      setMsg('✅ Distribution pool saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Pool save failed'}`);
    } finally {
      setSavingPool(false);
    }
  }

  async function saveAdmins(next: string[]) {
    setMsg(null);
    setSavingAdmins(true);
    try {
      await sendJSON('/api/admin/config/admins', 'PUT', { wallets: next });
      setAdmins(next);
      setNewAdmin('');
      setMsg('✅ Admin wallets saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Admins save failed'}`);
    } finally {
      setSavingAdmins(false);
    }
  }

  function addAdmin() {
    const v = newAdmin.trim();
    if (!v) return;
    if (admins.includes(v)) {
      setNewAdmin('');
      return;
    }
    saveAdmins([...admins, v]);
  }
  function removeAdmin(w: string) {
    saveAdmins(admins.filter((x) => x !== w));
  }

  const poolDisabled =
    savingPool || pool.trim() === '' || !Number.isFinite(poolNumber);

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
            <span className="text-sm">
              {savingClaim ? 'Saving…' : claimOpen ? 'Open' : 'Closed'}
            </span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={!!claimOpen}
              onChange={(e) => toggleClaim(e.target.checked)}
              disabled={savingClaim}
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
              <span className="text-sm">
                {savingApp ? 'Saving…' : appEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!!appEnabled}
                onChange={(e) => toggleApp(e.target.checked)}
                disabled={savingApp}
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
            disabled={savingPool}
          />
          <button
            onClick={savePool}
            disabled={poolDisabled}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPool ? 'Saving…' : 'Save'}
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
                    className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-sm disabled:opacity-50"
                    disabled={savingAdmins}
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
              disabled={savingAdmins}
            />
            <button
              onClick={addAdmin}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              disabled={savingAdmins || newAdmin.trim() === ''}
            >
              {savingAdmins ? 'Saving…' : 'Add'}
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
