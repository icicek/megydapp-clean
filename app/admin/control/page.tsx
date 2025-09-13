// app/admin/control/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ---------------- CSRF helpers ---------------- */
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

/* ---------------- fetch helpers ---------------- */
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

/* ---------------- utils ---------------- */
type BoolConfigResponse = { success: boolean; value: unknown };
const asBool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'on';
  }
  return false;
};

const CARD =
  'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm hover:shadow transition-shadow';

/* ---------------- tiny Toggle component (accessible) ---------------- */
type ToggleProps = {
  checked: boolean | null;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  color?: 'emerald' | 'blue' | 'amber';
  title?: string;
};
function Toggle({ checked, onChange, disabled, color = 'emerald', title }: ToggleProps) {
  const isOn = !!checked;
  const onBg =
    color === 'blue' ? 'bg-blue-600' : color === 'amber' ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => !disabled && onChange(!isOn)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
          e.preventDefault();
          onChange(!isOn);
        }
      }}
      title={title}
      className="inline-flex items-center gap-2"
    >
      <span
        className={[
          'flex h-6 w-11 rounded-full p-1 transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          isOn ? `justify-end ${onBg}` : 'justify-start bg-white/10',
        ].join(' ')}
      >
        <span className="h-4 w-4 rounded-full bg-white" />
      </span>
    </button>
  );
}

/* ---------------- page ---------------- */
export default function AdminControlPage() {
  const [whoami, setWhoami] = useState<string | null>(null);

  // toggles
  const [claimOpen, setClaimOpen] = useState<boolean | null>(null);
  const [appEnabled, setAppEnabled] = useState<boolean | null>(null);
  const [cronEnabled, setCronEnabled] = useState<boolean | null>(null);

  // saving flags
  const [savingClaim, setSavingClaim] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [savingCron, setSavingCron] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [savingAdmins, setSavingAdmins] = useState(false);
  const [savingRate, setSavingRate] = useState(false);

  // distribution pool
  const [pool, setPool] = useState<string>(''); // text input
  const poolNumber = useMemo(() => Number(pool), [pool]);

  // coincarnation rate (USD per 1 MEGY)
  const [rate, setRate] = useState<string>(''); // text input
  const rateNumber = useMemo(() => Number(rate), [rate]);

  // admins
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');

  // page state
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // optional endpoints guard
  const [hasAppEnabled, setHasAppEnabled] = useState(false);
  const [hasAdminsCfg, setHasAdminsCfg] = useState(false);
  const [hasRateCfg, setHasRateCfg] = useState(false);
  const [hasCronCfg, setHasCronCfg] = useState(false);

  /* -------- initial load -------- */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // whoami
        try {
          const w = await getJSON<{ ok?: boolean; wallet?: string | null }>(
            '/api/admin/whoami?strict=0'
          );          
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

        // cron_enabled (optional)
        try {
          const resp = await getJSON<BoolConfigResponse>('/api/admin/config/cron_enabled');
          setCronEnabled(asBool(resp?.value));
          setHasCronCfg(true);
        } catch {
          setHasCronCfg(false);
          setCronEnabled(null);
        }

        // distribution_pool
        try {
          const dp = await getJSON<{ success: boolean; value: number }>(
            '/api/admin/config/distribution_pool'
          );
          setPool(String(dp?.value ?? ''));
        } catch {
          setPool('');
        }

        // coincarnation_rate (USD per 1 MEGY)
        try {
          const cr = await getJSON<{ success: boolean; value: number }>(
            '/api/admin/config/coincarnation_rate'
          );
          setRate(String(cr?.value ?? ''));
          setHasRateCfg(true);
        } catch {
          setHasRateCfg(false);
          setRate('');
        }

        // admins (optional)
        try {
          const ad = await getJSON<{ success: boolean; wallets: string[] }>(
            '/api/admin/config/admins'
          );
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

  /* -------- actions -------- */
  async function toggleClaim(next: boolean) {
    setMsg(null);
    setSavingClaim(true);
    try {
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

  async function toggleCron(next: boolean) {
    setMsg(null);
    setSavingCron(true);
    try {
      await sendJSON('/api/admin/config/cron_enabled', 'POST', { value: String(next) });
      setCronEnabled(next);
      setMsg('✅ Cron enabled setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Cron enabled save failed'}`);
    } finally {
      setSavingCron(false);
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
    if (!Number.isFinite(poolNumber) || poolNumber < 0) {
      setMsg('❌ Enter a valid non-negative number');
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

  async function saveRate() {
    setMsg(null);
    setSavingRate(true);
    if (rate.trim() === '') {
      setMsg('❌ Enter a value');
      setSavingRate(false);
      return;
    }
    if (!Number.isFinite(rateNumber) || rateNumber <= 0) {
      setMsg('❌ Enter a valid positive number (USD per 1 MEGY)');
      setSavingRate(false);
      return;
    }
    try {
      await sendJSON('/api/admin/config/coincarnation_rate', 'PUT', { value: rateNumber });
      setMsg('✅ Coincarnation rate saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Rate save failed'}`);
    } finally {
      setSavingRate(false);
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

  /* -------- derived -------- */
  const poolDisabled =
    savingPool || pool.trim() === '' || !Number.isFinite(poolNumber) || poolNumber < 0;
  const rateDisabled =
    savingRate || rate.trim() === '' || !Number.isFinite(rateNumber) || rateNumber <= 0;

  /* -------- UI -------- */
  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Control Panel</h1>
            <p className="text-xs text-white/60 mt-1">
              Manage global switches & distribution settings
            </p>
          </div>
          <Link
            href="/admin/tokens"
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
          >
            Tokens
          </Link>
        </div>

        {/* Alerts */}
        {msg && <div className={`${CARD} text-sm`}>{msg}</div>}
        {loading && (
          <div className={`${CARD} text-sm text-white/70`}>
            Loading…
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Claim toggle */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Claim Panel</div>
                <div className="text-xs text-white/60">Enable/disable public claiming</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm min-w-[64px] text-right">
                  {savingClaim ? 'Saving…' : claimOpen ? 'Açık' : 'Kapalı'}
                </span>
                <Toggle
                  checked={!!claimOpen}
                  onChange={(v) => toggleClaim(v)}
                  disabled={savingClaim}
                  color="emerald"
                />
              </div>
            </div>
          </section>

          {/* App enabled toggle (optional) */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">App Enabled</div>
                <div className="text-xs text-white/60">Global kill-switch for write operations</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm min-w-[64px] text-right">
                  {savingApp ? 'Saving…' : appEnabled ? 'Açık' : 'Kapalı'}
                </span>
                <Toggle
                  checked={!!appEnabled}
                  onChange={(v) => toggleApp(v)}
                  disabled={savingApp || !hasAppEnabled}
                  color="blue"
                  title={!hasAppEnabled ? 'Endpoint not available' : undefined}
                />
              </div>
            </div>
          </section>

          {/* Cron enabled toggle (optional) */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Cron Enabled</div>
                <div className="text-xs text-white/60">
                  Reclassify / snapshot gibi zamanlanmış işleri aç/kapat
                </div>
                <div className="text-[11px] text-white/50 mt-1">
                  Not: <code>CRON_ENABLED</code> ENV set edilmişse bu toggle’ı override eder.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm min-w-[64px] text-right">
                  {savingCron ? 'Saving…' : cronEnabled ? 'Açık' : 'Kapalı'}
                </span>
                <Toggle
                  checked={!!cronEnabled}
                  onChange={(v) => toggleCron(v)}
                  disabled={savingCron || !hasCronCfg}
                  color="amber"
                  title={!hasCronCfg ? 'Endpoint not available' : undefined}
                />
              </div>
            </div>
          </section>

          {/* Distribution pool */}
          <section className={`${CARD} md:col-span-2`}>
            <div className="font-semibold mb-3">Distribution Pool</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                inputMode="decimal"
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                className="w-48 rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                placeholder="0"
                disabled={savingPool}
              />
              <button
                onClick={savePool}
                disabled={poolDisabled}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPool ? 'Saving…' : 'Save'}
              </button>
              <div className="text-[11px] text-white/60">
                Total MEGY amount to be distributed for the current snapshot (pool-mode).
              </div>
            </div>
          </section>

          {/* Coincarnation Rate (USD per 1 MEGY) */}
          <section className={CARD}>
            <div className="font-semibold">Coincarnation Rate</div>
            <div className="text-xs text-white/60 mb-3">
              USD price per 1 MEGY. Example: 1 → 1 USD/MEGY; 2 → 0.5 MEGY per USD; 3 → 0.33 MEGY per USD.
            </div>
            <div className="flex items-center gap-3">
              <input
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-40 rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                placeholder="1"
                disabled={savingRate || !hasRateCfg}
                title={!hasRateCfg ? 'Endpoint not available' : undefined}
              />
              <button
                onClick={saveRate}
                disabled={rateDisabled || !hasRateCfg}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingRate ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Quick presets */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[1, 2, 3, 5, 8, 13].map((v) => (
                <button
                  key={v}
                  onClick={() => setRate(String(v))}
                  disabled={savingRate || !hasRateCfg}
                  className="px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-sm disabled:opacity-50"
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-white/60 mt-3">
              Tip: Start with 1 USD/MEGY for Phase 1 (e.g., distribute ~500k MEGY), then raise to 2, 3, 5, 8…
            </div>
          </section>

          {/* Admin wallets (optional) */}
          <section className={`${CARD} md:col-span-2`}>
            <div className="font-semibold mb-3">Admin Wallets</div>

            {!hasAdminsCfg ? (
              <div className="text-sm text-white/60">Endpoint not available.</div>
            ) : admins.length === 0 ? (
              <div className="text-sm text-white/60">No admins set yet.</div>
            ) : (
              <ul className="space-y-2">
                {admins.map((w) => (
                  <li key={w} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{w}</span>
                    <button
                      onClick={() => removeAdmin(w)}
                      className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm disabled:opacity-50"
                      disabled={savingAdmins}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                placeholder="New admin wallet (base58)"
                className="flex-1 rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                disabled={savingAdmins || !hasAdminsCfg}
              />
              <button
                onClick={addAdmin}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                disabled={savingAdmins || newAdmin.trim() === '' || !hasAdminsCfg}
              >
                {savingAdmins ? 'Saving…' : 'Add'}
              </button>
            </div>
            <div className="text-[11px] text-white/60 mt-2">
              Updates the DB allowlist used by admin login verification.
            </div>
          </section>

          {/* Trust & Safety — info card (read-only) */}
          <section className={`${CARD} md:col-span-2`}>
            <div className="font-semibold mb-2">Trust &amp; Safety</div>
            <ul className="list-disc pl-5 text-sm text-white/75 space-y-1">
              <li><span title="Pool-Proportional: everyone receives proportional to USD contribution.">Pool-Proportional Distribution</span> — allocations are proportional to USD contributions.</li>
              <li><span title="Floor: USD/MEGY does not go below the previous phase.">Floor Guard</span> — partial distribution on low contributions; the remainder rolls over.</li>
              <li>Market-independent — distribution isn’t tied to external price; live implied rate and full-unlock target are shown.</li>
              <li>Snapshot &amp; finalize — allocations freeze at close; post-phase reports are published.</li>
            </ul>
            <div className="text-[11px] text-white/60 mt-2">
              Details & formulas: <a className="underline" href="/trust">/trust</a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
