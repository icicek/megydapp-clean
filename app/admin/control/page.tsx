// app/admin/control/page.tsx
'use client';

import { useEffect, useState } from 'react';
import useAdminWalletGuard from '@/hooks/useAdminWalletGuard';

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
  const [savingAdmins, setSavingAdmins] = useState(false);

  // admins
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');

  // page state
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // optional endpoints guard
  const [hasAppEnabled, setHasAppEnabled] = useState(false);
  const [hasAdminsCfg, setHasAdminsCfg] = useState(false);
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

  /* -------- actions -------- */
  async function toggleClaim(next: boolean) {
    if (!ensureCriticalAdminAccess()) return;
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
    if (!ensureCriticalAdminAccess()) return;
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
    if (!ensureCriticalAdminAccess()) return;
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

  async function saveAdmins(next: string[]) {
    if (!ensureCriticalAdminAccess()) return;
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

  const {
    loading: adminGuardLoading,
    canRunCriticalAdminAction,
    guardMessage,
    walletMatches,
    sessionWallet,
    connectedWallet,
  } = useAdminWalletGuard();

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

          <div className="flex items-center gap-2">
          </div>
        </div>

        {/* Alerts */}
        {msg && <div className={`${CARD} text-sm`}>{msg}</div>}
        {loading && (
          <div className={`${CARD} text-sm text-white/70`}>
            Loading…
          </div>
        )}

        {!adminGuardLoading && !walletMatches && (
          <div className={`${CARD} text-sm text-yellow-100 border-yellow-500/20 bg-yellow-500/10`}>
            <div className="font-medium">Admin wallet verification required</div>
            <div className="mt-1 text-xs text-yellow-200/80">
              Critical actions on this page require the connected wallet to match the active admin session wallet.
            </div>
            <div className="mt-2 text-xs text-yellow-200/80 space-y-1">
              {sessionWallet ? <div>Session wallet: {sessionWallet}</div> : null}
              {connectedWallet ? <div>Connected wallet: {connectedWallet}</div> : null}
            </div>
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
                  {savingClaim ? 'Saving…' : claimOpen ? 'On' : 'Off'}
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
                  {savingApp ? 'Saving…' : appEnabled ? 'On' : 'Off'}
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
                  Enable or disable scheduled jobs such as reclassification and snapshot tasks.
                </div>
                <div className="text-[11px] text-white/50 mt-1">
                  Note: if <code>CRON_ENABLED</code> is set in ENV, it overrides this toggle.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm min-w-[64px] text-right">
                  {savingCron ? 'Saving…' : cronEnabled ? 'On' : 'Off'}
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

          {/* CorePoint Weights */}
          <section className={`${CARD} md:col-span-2`}>
            <div className="font-semibold mb-2">CorePoint Weights</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* USD per $1 */}
              <NumberConfig
                label="USD → points (per $1)"
                keyName="cp_usd_per_1"
                help="Example: 100 → 1 USD = 100 pts"
                presets={[50, 100, 150, 200]}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
              {/* Deadcoin first */}
              <NumberConfig
                label="Deadcoin (first per contract)"
                keyName="cp_deadcoin_first"
                help="Awarded once per wallet+contract"
                presets={[50, 100, 150, 200]}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
              {/* Share twitter / other */}
              <NumberConfig
                label="Share: X (Twitter)"
                keyName="cp_share_twitter"
                presets={[10, 20, 30, 50]}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
              <NumberConfig
                label="Share: Others (Telegram/WA/IG/TikTok/Email/Copy)"
                keyName="cp_share_other"
                presets={[5, 10, 15, 20]}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
              {/* Referral */}
              <NumberConfig
                label="Referral (signup)"
                keyName="cp_referral_signup"
                help="Award referrer when a referee joins for the first time"
                presets={[50, 100, 150]}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
            </div>

            <div className="font-semibold mt-6 mb-2">Multipliers</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberConfig
                label="Share multiplier"
                keyName="cp_mult_share"
                presets={[1.0, 0.8, 0.6, 0.5]}
                step={0.1}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />

              <NumberConfig
                label="USD multiplier"
                keyName="cp_mult_usd"
                presets={[1.0, 0.9, 0.75, 0.5]}
                step={0.1}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />

              <NumberConfig
                label="Deadcoin multiplier"
                keyName="cp_mult_deadcoin"
                presets={[1.0, 0.8, 0.6, 0.5]}
                step={0.1}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />

              <NumberConfig
                label="Referral multiplier"
                keyName="cp_mult_referral"
                presets={[1.0, 0.9, 0.75, 0.5]}
                step={0.1}
                canSave={canRunCriticalAdminAction}
                onBlocked={() => setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`)}
                onSaved={(message) => setMsg(`✅ ${message}`)}
                onError={(message) => setMsg(`❌ ${message}`)}
              />
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

function NumberConfig({
  label,
  keyName,
  help,
  presets = [],
  step = 1,
  canSave = true,
  onBlocked,
  onSaved,
  onError,
}: {
  label: string;
  keyName: string;
  help?: string;
  presets?: (number | string)[];
  step?: number;
  canSave?: boolean;
  onBlocked?: () => void;
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const [val, setVal] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/config/${keyName}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        const v = j?.value ?? '';
        setVal(String(v));
      } catch {}
    })();
  }, [keyName]);

  async function save() {
    if (!canSave) {
      onBlocked?.();
      return;
    }
  
    const num = Number(val);
  
    if (val.trim() === '' || !Number.isFinite(num)) {
      onError?.(`Invalid value for ${label}.`);
      return;
    }
  
    setSaving(true);
  
    try {
      await sendJSON(`/api/admin/config/${keyName}`, 'PUT', { value: num });
      onSaved?.(`${label} saved.`);
    } catch (e: any) {
      onError?.(e?.message || `Failed to save ${label}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-4 bg-white/5">
      <div className="text-sm font-medium">{label}</div>
      {help && <div className="text-[11px] text-white/60 mt-0.5">{help}</div>}
      <div className="mt-2 flex items-center gap-2">
        <input
          inputMode="decimal"
          step={step}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-36 rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
        />
        <button
          onClick={save}
          disabled={saving || val.trim() === '' || !Number.isFinite(Number(val))}
          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={String(p)}
              onClick={() => setVal(String(p))}
              className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-xs"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
