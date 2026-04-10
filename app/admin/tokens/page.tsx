// app/admin/tokens/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import useAdminWalletGuard from '@/hooks/useAdminWalletGuard';

import ExportCsvButton from '@/components/admin/ExportCsvButton';
import TokenInfoModal, { type VolumeResp } from '@/components/admin/TokenInfoModal';

/* ────────────────────────────────────────────────────────── */
/* UI: Tek tip toolbar butonu                                 */
/* ────────────────────────────────────────────────────────── */
const TB =
  'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 ' +
  'bg-white/5 hover:bg-white/10 transition-colors text-sm whitespace-nowrap';

/* ────────────────────────────────────────────────────────── */
/* Tipler                                                     */
/* ────────────────────────────────────────────────────────── */
const STATUSES = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

const STATUS_STYLES: Record<TokenStatus, string> = {
  healthy: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700',
  walking_dead: 'bg-amber-900/50 text-amber-200 border border-amber-700',
  deadcoin: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
  redlist: 'bg-rose-900/50 text-rose-200 border border-rose-700',
  blacklist: 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-700',
};

type AuditRow = {
  mint: string;
  old_status: TokenStatus | null;
  new_status: TokenStatus;
  reason: string | null;
  meta: any;
  updated_by: string | null;
  changed_at: string;
};

type NameEntry = {
  symbol?: string;
  name?: string;
};

type AdminTokenRow = {
  mint: string;
  status: TokenStatus;
  status_at: string | null;
  updated_by: string | null;
  reason: string | null;
  meta: any;
  created_at: string;
  updated_at: string;
  meta_source: string | null;
  yes_count: number;
};

/* ────────────────────────────────────────────────────────── */
/* Mini Toast                                                 */
/* ────────────────────────────────────────────────────────── */
type Toast = { id: number; message: string; kind?: 'ok' | 'err' | 'info' };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  }, []);
  return { toasts, push };
}
function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'rounded px-3 py-2 text-sm shadow',
            t.kind === 'ok' ? 'bg-green-600 text-white' : t.kind === 'err' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white',
          ].join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Helpers                                                    */
/* ────────────────────────────────────────────────────────── */
function shortenWallet(w?: string | null) {
  if (!w) return 'Admin';
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
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

/* ────────────────────────────────────────────────────────── */
/* UI parçaları                                               */
/* ────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const isKnown = (STATUSES as readonly string[]).includes(status as any);
  const s = (isKnown ? status : 'healthy') as TokenStatus;
  return <span className={['rounded px-2 py-0.5 text-xs', STATUS_STYLES[s]].join(' ')}>{s}</span>;
}
function VotesBadge({ yes, threshold }: { yes: number; threshold: number }) {
  const ratio = threshold > 0 ? yes / threshold : 0;
  const cls =
    ratio >= 1 ? 'bg-red-600 text-white' : ratio >= 0.66 ? 'bg-amber-500 text-black' : 'bg-neutral-200 text-black';
  return (
    <span
      className={[
        'inline-flex items-center justify-center rounded-full font-semibold',
        'h-5 min-w-[48px] px-2 text-[10px]',
        'sm:h-6 sm:min-w-[56px] sm:px-2 sm:text-[11px]',
        cls,
      ].join(' ')}
      title={`YES ${yes}/${threshold}`}
    >
      {`YES ${yes}/${threshold}`}
    </span>
  );
}

function MetaSourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;

  const label = source.toLowerCase();

  const cls =
    label === 'tokenlist'
      ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/60'
      : label === 'coingecko'
      ? 'bg-lime-900/40 text-lime-200 border border-lime-700/60'
      : label === 'dexscreener'
      ? 'bg-sky-900/40 text-sky-200 border border-sky-700/60'
      : label === 'onchain'
      ? 'bg-violet-900/40 text-violet-200 border border-violet-700/60'
      : label === 'db_cache'
      ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
      : 'bg-gray-800 text-gray-200 border border-gray-700';

  return (
    <span className={['inline-flex rounded px-1.5 py-0.5 text-[10px]', cls].join(' ')}>
      {label}
    </span>
  );
}

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

/* ────────────────────────────────────────────────────────── */
/* Fetch helper (cookie only)                                 */
/* ────────────────────────────────────────────────────────── */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getCsrfToken();

  const headers = new Headers(init.headers || {});
  headers.set('X-Requested-With', 'fetch');

  if (token) {
    headers.set('x-csrf-token', token);
  }

  const res = await fetch(path, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/admin/login');
    }

    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch {}

    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

async function fetchSymbolMeta(mint: string): Promise<NameEntry | null> {
  try {
    const res = await fetch(`/api/symbol?mint=${encodeURIComponent(mint)}`, {
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const j = await res.json();

    if (!j?.symbol && !j?.name) return null;

    return {
      symbol: j.symbol || undefined,
      name: j.name || undefined,
    };
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────── */
/* Sayfa                                                      */
/* ────────────────────────────────────────────────────────── */
export default function AdminTokensPage() {
  const {
  loading: adminGuardLoading,
  canRunCriticalAdminAction,
  guardMessage,
  walletMatches,
  sessionWallet,
  connectedWallet,
} = useAdminWalletGuard();
  const { toasts, push } = useToasts();

  // list state
  const [items, setItems] = useState<AdminTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  // metadata cache state
  const [nameMap, setNameMap] = useState<Record<string, NameEntry>>({});
  const inFlightMetaRef = useRef<Set<string>>(new Set());

  // pagination
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);

  // bulk update
  const [selectedMints, setSelectedMints] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<TokenStatus>('healthy');
  const [bulkReason, setBulkReason] = useState('bulk admin update');
  const [bulkSaving, setBulkSaving] = useState(false);

  // history modal
  const [histOpen, setHistOpen] = useState(false);
  const [histMint, setHistMint] = useState<string | null>(null);
  const [histItems, setHistItems] = useState<AuditRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histHasMore, setHistHasMore] = useState(false);
  const [histLoadingMore, setHistLoadingMore] = useState(false);
  const HIST_LIMIT = 50;

  // stats
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number>; lastUpdatedAt: string | null } | null>(null);

  // settings
  const [voteThreshold, setVoteThreshold] = useState<number>(3);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  // settings (genişletildi)
  const [includeCEX, setIncludeCEX] = useState<boolean>(false);
  
  const [healthyMinVolUSD, setHealthyMinVolUSD] = useState<number>(100);
  const [healthyMinLiqUSD, setHealthyMinLiqUSD] = useState<number>(10000);
  const [walkingDeadMinVolUSD, setWalkingDeadMinVolUSD] = useState<number>(0);
  const [walkingDeadMinLiqUSD, setWalkingDeadMinLiqUSD] = useState<number>(100);

  // INFO modal state
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoMint, setInfoMint] = useState<string | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoData, setInfoData] = useState<VolumeResp | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  async function openInfo(mintVal: string) {
    try {
      setInfoOpen(true);
      setInfoMint(mintVal);
      setInfoLoading(true);
      setInfoErr(null);
      const data = await api<VolumeResp>(
        `/api/admin/tokens/volume?mint=${encodeURIComponent(mintVal)}&includeCEX=${includeCEX ? '1' : '0'}`
      );      
      setInfoData(data);
    } catch (e: any) {
      setInfoErr(e?.message || 'Load error');
      setInfoData(null);
      push('Info load error', 'err');
    } finally {
      setInfoLoading(false);
    }
  }
  function closeInfo() {
    setInfoOpen(false);
    setInfoMint(null);
    setInfoData(null);
    setInfoErr(null);
  }

  // query string
  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    sp.set('limit', String(limit));
    sp.set('offset', String(page * limit));
    return sp.toString();
  }, [q, status, limit, page]);

  /* ── loaders ───────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{ success: true; items: AdminTokenRow[] }>(`/api/admin/tokens?${params}`);
      setItems(data.items || []);
    } catch (e: any) {
      const msg = e?.message || 'Load error';
      setError(msg);
      push(msg, 'err');
    } finally {
      setLoading(false);
    }
  }, [params, push]);

  function ensureCriticalAdminAccess(): boolean {
    if (adminGuardLoading) {
      setError('Checking admin wallet...');
      return false;
    }
  
    if (!canRunCriticalAdminAction) {
      setError(guardMessage || 'Admin wallet verification failed.');
      return false;
    }
  
    return true;
  }

  const loadStats = useCallback(async () => {
    try {
      const j = await api<{
        success?: boolean;
        total: number;
        byStatus: Record<string, number>;
        lastUpdatedAt: string | null;
      }>('/api/admin/registry/stats');
  
      if (j?.success) {
        setStats(j);
      } else {
        throw new Error('STATS_LOAD_FAILED');
      }
    } catch {
      push('Stats load error', 'err');
    }
  }, [push]);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const d = await api<any>('/api/admin/settings');
  
      if (d?.success) {
        setVoteThreshold(d.voteThreshold ?? 3);
        setIncludeCEX(!!d.includeCEX);
  
        if (typeof d.healthyMinVolUSD === 'number') setHealthyMinVolUSD(d.healthyMinVolUSD);
        if (typeof d.healthyMinLiqUSD === 'number') setHealthyMinLiqUSD(d.healthyMinLiqUSD);
        if (typeof d.walkingDeadMinVolUSD === 'number') setWalkingDeadMinVolUSD(d.walkingDeadMinVolUSD);
        if (typeof d.walkingDeadMinLiqUSD === 'number') setWalkingDeadMinLiqUSD(d.walkingDeadMinLiqUSD);
      }
    } catch {
      // silent on first load
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  // mount: stats + settings
  useEffect(() => {
    loadStats();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // params değişince load (debounced)
  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load, params]);

  useEffect(() => {
    setPage(0);
  }, [q, status, limit]);

  useEffect(() => {
    setSelectedMints((prev) => prev.filter((mint) => items.some((it) => it.mint === mint)));
  }, [items]);

  useEffect(() => {
    if (items.length === 0) return;
  
    let cancelled = false;
  
    (async () => {
      const visibleMints = items.map((it) => String(it.mint));
  
      const missing = visibleMints.filter(
        (mint) => !nameMap[mint] && !inFlightMetaRef.current.has(mint)
      );
  
      if (missing.length === 0) return;
  
      missing.forEach((mint) => inFlightMetaRef.current.add(mint));
  
      try {
        const results = await Promise.all(
          missing.map(async (mint) => {
            const meta = await fetchSymbolMeta(mint);
            return { mint, meta };
          })
        );
  
        if (cancelled) return;
  
        const updates: Record<string, NameEntry> = {};
  
        for (const row of results) {
          if (row.meta) {
            updates[row.mint] = row.meta;
          }
        }
  
        if (Object.keys(updates).length > 0) {
          setNameMap((prev) => ({ ...prev, ...updates }));
        }
      } finally {
        missing.forEach((mint) => inFlightMetaRef.current.delete(mint));
      }
    })();
  
    return () => {
      cancelled = true;
    };
  }, [items, nameMap]);

  async function postStatusUpdate(mint: string, nextStatus: TokenStatus, reason: string) {
    return api('/api/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint,
        status: nextStatus,
        reason,
      }),
    });
  }
  
  /* ── actions ───────────────────────────────────────────── */
  async function setStatusFor(m: string, s: TokenStatus) {
    if (!ensureCriticalAdminAccess()) return;

    try {
      setError(null);
      await postStatusUpdate(m, s, 'admin panel');
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
    if (!ensureCriticalAdminAccess()) return;
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
  async function applyBulkStatus() {
    if (!ensureCriticalAdminAccess()) return;

    if (selectedMints.length === 0) {
      push('No tokens selected', 'info');
      return;
    }

    const reason = bulkReason.trim() || 'bulk admin update';

    const ok = window.confirm(
      `Apply "${bulkStatus}" to ${selectedMints.length} token(s)?\n\nReason: ${reason}`
    );
    if (!ok) return;

    try {
      setBulkSaving(true);
      setError(null);

      let successCount = 0;
      let failCount = 0;

      for (const mint of selectedMints) {
        try {
          await postStatusUpdate(mint, bulkStatus, reason);
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        push(`✅ Bulk updated: ${successCount}`, 'ok');
      }
      if (failCount > 0) {
        push(`⚠️ Failed updates: ${failCount}`, 'info');
      }

      await load();
      await loadStats();
      clearSelectedMints();
    } catch (e: any) {
      const msg = e?.message || 'Bulk update error';
      setError(msg);
      push(`❌ ${msg}`, 'err');
    } finally {
      setBulkSaving(false);
    }
  }

  async function repairHelpersForMint(m: string) {
    if (!ensureCriticalAdminAccess()) return;
    try {
      setError(null);
      const res = await api<{ success: true; updated_count: number }>(
        '/api/admin/contributions/resync-helpers',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: m }),
        }
      );

      push(`🛠️ Helper fields repaired (${res.updated_count})`, 'ok');
      await load();
    } catch (e: any) {
      const msg = e?.message || 'Repair error';
      setError(msg);
      push(`❌ ${msg}`, 'err');
    }
  }

  async function lookupOneMint(mint: string) {
    if (inFlightMetaRef.current.has(mint)) {
      push('Metadata request already in progress', 'info');
      return;
    }
  
    try {
      inFlightMetaRef.current.add(mint);
  
      const meta = await fetchSymbolMeta(mint);
  
      if (meta?.symbol || meta?.name) {
        setNameMap((prev) => ({ ...prev, [mint]: meta }));
        push('Metadata fetched', 'ok');
      } else {
        push('No metadata found', 'info');
      }
    } catch {
      push('Lookup failed', 'err');
    } finally {
      inFlightMetaRef.current.delete(mint);
    }
  }
  const visibleMints = useMemo(() => items.map((it) => String(it.mint)), [items]);

  const allVisibleSelected =
    visibleMints.length > 0 && visibleMints.every((mint) => selectedMints.includes(mint));

  function toggleSelectedMint(mint: string) {
    setSelectedMints((prev) =>
      prev.includes(mint) ? prev.filter((x) => x !== mint) : [...prev, mint]
    );
  }

  function toggleSelectAllVisible() {
    setSelectedMints((prev) => {
      if (visibleMints.length === 0) return prev;

      const allSelected = visibleMints.every((mint) => prev.includes(mint));
      if (allSelected) {
        return prev.filter((mint) => !visibleMints.includes(mint));
      }

      const merged = new Set([...prev, ...visibleMints]);
      return Array.from(merged);
    });
  }

  function clearSelectedMints() {
    setSelectedMints([]);
  }
  const fetchHistory = useCallback(async (mintVal: string, offset = 0) => {
    const url = `/api/admin/audit?mint=${encodeURIComponent(mintVal)}&limit=${HIST_LIMIT}&offset=${offset}`;
    const data = await api<{ success: true; items: AuditRow[] }>(url);
    return data.items || [];
  }, []);
  async function openHistory(mintVal: string) {
    try {
      setHistOpen(true);
      setHistMint(mintVal);
      setHistItems(null);
      setHistLoading(true);
      const first = await fetchHistory(mintVal, 0);
      setHistItems(first);
      setHistHasMore(first.length === HIST_LIMIT);
    } catch (e: any) {
      push(e?.message || 'History load error', 'err');
    } finally {
      setHistLoading(false);
    }
  }
  async function loadMoreHistory() {
    if (!histMint || histLoadingMore || !histItems) return;
    try {
      setHistLoadingMore(true);
      const next = await fetchHistory(histMint, histItems.length);
      setHistItems([...histItems, ...next]);
      setHistHasMore(next.length === HIST_LIMIT);
    } catch (e: any) {
      push(e?.message || 'Load more failed', 'err');
    } finally {
      setHistLoadingMore(false);
    }
  }
  function isValidNonNegativeNumber(v: unknown): boolean {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }
  async function saveSettings() {
    if (!ensureCriticalAdminAccess()) return;

    if (!Number.isFinite(voteThreshold) || voteThreshold < 1 || voteThreshold > 50) {
      setSettingsMsg('❌ Vote threshold must be between 1 and 50.');
      push('Invalid vote threshold', 'err');
      return;
    }

    if (
      !isValidNonNegativeNumber(healthyMinVolUSD) ||
      !isValidNonNegativeNumber(healthyMinLiqUSD) ||
      !isValidNonNegativeNumber(walkingDeadMinVolUSD) ||
      !isValidNonNegativeNumber(walkingDeadMinLiqUSD)
    ) {
      setSettingsMsg('❌ Threshold values must be valid non-negative numbers.');
      push('Invalid threshold values', 'err');
      return;
    }

    try {
      setSettingsMsg(null);
      setSavingThreshold(true);

      const d = await api<any>('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voteThreshold,
          includeCEX,
          healthyMinVolUSD,
          healthyMinLiqUSD,
          walkingDeadMinVolUSD,
          walkingDeadMinLiqUSD,
          changedBy: 'admin_ui',
        }),
      });

      if (d?.success) {
        setVoteThreshold(d.voteThreshold ?? voteThreshold);
        setIncludeCEX(!!d.includeCEX);

        if (typeof d.healthyMinVolUSD === 'number') setHealthyMinVolUSD(d.healthyMinVolUSD);
        if (typeof d.healthyMinLiqUSD === 'number') setHealthyMinLiqUSD(d.healthyMinLiqUSD);
        if (typeof d.walkingDeadMinVolUSD === 'number') setWalkingDeadMinVolUSD(d.walkingDeadMinVolUSD);
        if (typeof d.walkingDeadMinLiqUSD === 'number') setWalkingDeadMinLiqUSD(d.walkingDeadMinLiqUSD);

        setSettingsMsg('✅ Saved');
        push('Settings saved', 'ok');
        await load();
      } else {
        setSettingsMsg(`❌ ${d?.error || 'Save failed'}`);
        push('Save failed', 'err');
      }
    } catch (e: any) {
      setSettingsMsg(`❌ ${e?.message || 'Save failed'}`);
      push('Save failed', 'err');
    } finally {
      setSavingThreshold(false);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#090d15] text-white p-6">
      <ToastViewport toasts={toasts} />

      {/* TOP BAR */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold mr-auto">🛡️ Token Management</h1>
        </div>
      </div>

      {!adminGuardLoading && !walletMatches && (
        <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
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

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by mint, symbol, or name"
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 min-w-[120px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !adminGuardLoading) void load();
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 min-w-[120px]"
        >
          <option value="">(all)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 min-w-[120px]"
            title="Rows per page"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
          <button onClick={() => void load()} disabled={loading} className={`${TB} ${loading ? 'opacity-70' : ''}`}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          {/* Export CSV */}
          <div className="shrink-0">
            <ExportCsvButton q={q} status={status || ''} />
          </div>
        </div>
      </div>

      {selectedMints.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="text-sm text-blue-100 min-w-[180px]">
              {selectedMints.length} token selected
            </div>

            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as TokenStatus)}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 min-w-[180px]"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Reason"
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 flex-1 min-w-[220px]"
            />

            <button
              onClick={applyBulkStatus}
              disabled={bulkSaving}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {bulkSaving ? 'Applying…' : 'Apply bulk update'}
            </button>

            <button
              onClick={clearSelectedMints}
              disabled={bulkSaving}
              className="px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Settings + Stats (mobilde dikey, >=md yatay sütun) */}
      <div className="grid gap-4 md:grid-cols-2 items-stretch mb-6">
        {/* ── Admin Settings (stretch) ─────────────────────────── */}
        <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-4 flex flex-col h-full">
          <h2 className="font-semibold mb-3">Admin Settings</h2>

          {/* Satır 1: Vote threshold + Include CEX */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm text-gray-300">Community Vote Threshold</label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={Number.isFinite(voteThreshold) ? voteThreshold : 1}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setVoteThreshold(Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 50) : 1);
              }}
              className="w-24 h-10 px-2 rounded bg-gray-950 border border-gray-700"
            />

            <label className="text-sm text-gray-300 ml-4">Include CEX Volume</label>
            <input
              type="checkbox"
              checked={!!includeCEX}
              onChange={(e) => setIncludeCEX(e.target.checked)}
              className="h-4 w-4"
              title="If enabled, total volume = DEX + CEX"
            />
          </div>

          {/* Satır 2: Threshold kartları (eş yükseklik + hizalı input) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
            {[
              {
                label: 'Healthy Min Volume (USD, 24h)',
                val: healthyMinVolUSD,
                set: setHealthyMinVolUSD,
              },
              {
                label: 'Healthy Min Liquidity (USD)',
                val: healthyMinLiqUSD,
                set: setHealthyMinLiqUSD,
              },
              {
                label: 'Walking Dead Min Volume (USD, 24h)',
                val: walkingDeadMinVolUSD,
                set: setWalkingDeadMinVolUSD,
              },
              {
                label: 'Walking Dead Min Liquidity (USD)',
                val: walkingDeadMinLiqUSD,
                set: setWalkingDeadMinLiqUSD,
              },
            ].map((box, i) => (
              <div
                key={i}
                className="bg-gray-950 border border-gray-800 rounded p-3 flex flex-col h-full"
              >
                <div className="text-[11px] text-gray-400 mb-2 min-h-[18px]">
                  {box.label}
                </div>
                {/* spacer + hizalanmış input */}
                <div className="mt-auto">
                  <input
                    type="number"
                    min={0}
                    value={box.val}
                    onChange={(e) => box.set(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full h-10 px-2 rounded bg-gray-900 border border-gray-700"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Save */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveSettings}
              disabled={savingThreshold || !settingsLoaded}
              className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {!settingsLoaded ? 'Loading…' : savingThreshold ? 'Saving…' : 'Save'}
            </button>
            {settingsMsg && <div className="text-xs text-gray-300">{settingsMsg}</div>}
          </div>

          <div className="mt-2 text-[11px] text-neutral-500">
            These thresholds control automatic classification on 24h volume + DEX max liquidity.
          </div>
        </div>

        {/* ── Registry Stats (stretch) ─────────────────────────── */}
        {stats && (
          <div className="bg-gray-900 border border-gray-700 rounded p-4 flex flex-col h-full">
            <h2 className="font-semibold mb-3">Registry Stats</h2>

            <div className="grid gap-3 sm:grid-cols-3 items-stretch">
              <div className="bg-gray-950 border border-gray-800 rounded p-3 flex flex-col h-full">
                <div className="text-xs text-gray-400">Total tokens</div>
                <div className="text-xl font-semibold mt-auto">{stats.total}</div>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded p-3 flex flex-col h-full">
                <div className="text-xs text-gray-400 mb-1">By status</div>
                <div className="flex flex-wrap gap-2 mt-auto text-sm">
                  {STATUSES.map((s) => (
                    <span key={s} className={['rounded px-2 py-0.5', STATUS_STYLES[s]].join(' ')}>
                      {s}: {stats.byStatus?.[s] ?? 0}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded p-3 flex flex-col h-full">
                <div className="text-xs text-gray-400">Last updated</div>
                <div className="text-sm mt-auto">
                  {stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-red-400 mb-4">❌ {error}</div>}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="text-left p-2 w-[52px]">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all visible"
                  title="Select all visible"
                />
              </th>
              <th className="text-left p-2 w-[460px]">Mint</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2 w-[120px]">Votes</th>
              <th className="text-left p-2 w-[120px]">By</th>
              <th className="text-left p-2">Status At</th>
              <th className="text-left p-2 w-[620px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="p-3 text-gray-400" colSpan={7}>
                  No records
                </td>
              </tr>
            )}
            {items.map((it) => {
              const yesCount = it.yes_count ?? 0;
              return (
                <tr key={it.mint} className="border-b border-gray-800">
                  <td className="p-2 align-top">
                    <input
                      type="checkbox"
                      checked={selectedMints.includes(it.mint)}
                      onChange={() => toggleSelectedMint(it.mint)}
                      aria-label={`Select ${it.mint}`}
                      title="Select token"
                    />
                  </td>
                  {/* Mint + Copy */}
                  <td className="p-2 w-[460px]">
                    <div className="grid gap-1 sm:grid-cols-[1fr_auto] items-start">
                      <div className="min-w-0">
                      <a
                        href={`https://dexscreener.com/search?q=${encodeURIComponent(it.mint)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono truncate block hover:underline underline-offset-2"
                        title="Open in Dexscreener"
                      >
                        {it.mint}
                      </a>
                        <div className="text-[11px] text-gray-400 space-y-1">
                          {nameMap[it.mint]?.symbol || nameMap[it.mint]?.name ? (
                            <>
                              <div>
                                {nameMap[it.mint]?.symbol ?? ''}
                                {nameMap[it.mint]?.name ? ` — ${nameMap[it.mint]?.name}` : ''}
                              </div>
                              <MetaSourceBadge source={it.meta_source} />
                            </>
                          ) : (
                            <button
                              onClick={() => lookupOneMint(it.mint)}
                              className="underline underline-offset-2 hover:text-gray-200"
                              title="Fetch name/symbol"
                            >
                              lookup
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await copyToClipboard(it.mint);
                          if (ok) push('Copied mint', 'ok');
                          else push('Copy failed', 'err');
                        }}
                        className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-[11px] w-fit sm:w-auto sm:text-xs"
                        aria-label="Copy mint"
                        title="Copy"
                      >
                        copy
                      </button>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="p-2">
                    <StatusBadge status={it.status} />
                  </td>

                  {/* Votes */}
                  <td className="p-2 w-[120px]">
                    <VotesBadge yes={yesCount} threshold={voteThreshold || 3} />
                  </td>

                  {/* Updated By */}
                  <td className="p-2 w-[120px]">
                    <span className="truncate block" title={it.updated_by ?? 'Admin'}>
                      {shortenWallet(it.updated_by)}
                    </span>
                  </td>

                  {/* Status At */}
                  <td className="p-2 whitespace-nowrap">
                    {it.status_at ? new Date(it.status_at).toLocaleString() : '—'}
                  </td>

                  {/* Actions */}
                  <td className="p-2 w-[620px]">
                    <div className="flex gap-2 whitespace-nowrap overflow-x-auto">
                      {STATUSES.map((s) => (
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

                      <button
                        onClick={() => repairHelpersForMint(it.mint)}
                        className="bg-orange-700 hover:bg-orange-600 rounded px-2 py-1"
                        title="Repair helper fields for this token"
                      >
                        repair
                      </button>

                      {/* 🔵 NEW: Info (volume breakdown) */}
                      <button
                        onClick={() => openInfo(it.mint)}
                        className="bg-sky-700 hover:bg-sky-600 rounded px-2 py-1"
                        title="Volume & Liquidity"
                      >
                        info
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* History Modal */}
      {histOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-[92vw] max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
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
                <>
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
                          <td className="p-2" title={h.updated_by ?? 'Admin'}>
                            {shortenWallet(h.updated_by)}
                          </td>
                          <td className="p-2">{h.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {histHasMore && (
                    <div className="flex justify-center mt-3">
                      <button
                        onClick={loadMoreHistory}
                        disabled={histLoadingMore}
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm disabled:opacity-60"
                      >
                        {histLoadingMore ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🔵 Info Modal (extracted component) */}
      <TokenInfoModal
        open={infoOpen}
        mint={infoMint}
        loading={infoLoading}
        data={infoData}
        error={infoErr}
        onClose={closeInfo}
        onRetry={() => infoMint && openInfo(infoMint)}
      />
    </div>
  );
}
