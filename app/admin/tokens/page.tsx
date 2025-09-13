// app/admin/tokens/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import { useWallet } from '@solana/wallet-adapter-react';
import BulkUpdateDialog from '../components/BulkUpdateDialog';
import { fetchSolanaTokenList } from '@/lib/utils';
import { fetchTokenMetadata } from '@/app/api/utils/fetchTokenMetadata';
import Link from 'next/link';

/** ---------- Status typing (single source of truth) ---------- */
const STATUSES = ['healthy','walking_dead','deadcoin','redlist','blacklist'] as const;
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

/* ---------- tiny toast ---------- */
type Toast = { id: number; message: string; kind?: 'ok'|'err'|'info' };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2200);
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

/* ---------- helpers ---------- */
function shortenWallet(w?: string | null) {
  if (!w) return 'Admin';
  return w.length > 10 ? `${w.slice(0,4)}…${w.slice(-4)}` : w;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      return true;
    } catch { return false; }
  }
}

/* ---------- localStorage cache for nameMap ---------- */
type NameEntry = { symbol?: string; name?: string };

const LS_KEY = 'cc_admin_nameMap_v1';
const LS_MAX = 1000; // en fazla kaç mint saklayalım (isteğe göre artır/azalt)

function loadNameCache(): Record<string, NameEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // basit doğrulama
    if (parsed && typeof parsed === 'object') return parsed as Record<string, NameEntry>;
  } catch {}
  return {};
}

function saveNameCache(map: Record<string, NameEntry>) {
  if (typeof window === 'undefined') return;
  try {
    const pruned = pruneMap(map, LS_MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(pruned));
  } catch {}
}

function pruneMap(map: Record<string, NameEntry>, max: number) {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  // insertion order garantisi yok ama çoğu durumda yeterli; gerekiyorsa TS'ye ts alanı ekleriz
  const keep = keys.slice(-max);
  const out: Record<string, NameEntry> = {};
  for (const k of keep) out[k] = map[k];
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const isKnown = (STATUSES as readonly string[]).includes(status as any);
  const s = (isKnown ? status : 'healthy') as TokenStatus;
  return (
    <span className={['rounded px-2 py-0.5 text-xs', STATUS_STYLES[s]].join(' ')}>
      {s}
    </span>
  );
}

// ✅ Votes badge (YES/threshold)
function VotesBadge({ yes, threshold }: { yes: number; threshold: number }) {
  const ratio = threshold > 0 ? yes / threshold : 0;
  const cls =
    ratio >= 1 ? 'bg-red-600 text-white' :
    ratio >= 0.66 ? 'bg-amber-500 text-black' :
    'bg-neutral-200 text-black';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      YES {yes}/{threshold}
    </span>
  );
}

// cookie-only API
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
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
  const { publicKey, connected } = useWallet();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [mint, setMint] = useState('');
  const [setTo, setSetTo] = useState<TokenStatus>('redlist');
  const [error, setError] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, { symbol?: string; name?: string }>>({});
  const [tokenListIndex, setTokenListIndex] = useState<Map<string, { symbol?: string; name?: string }>>();
  const [listReady, setListReady] = useState(false);

  // pagination
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);

  // History modal
  const [histOpen, setHistOpen] = useState(false);
  const [histMint, setHistMint] = useState<string | null>(null);
  const [histItems, setHistItems] = useState<AuditRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const HIST_LIMIT = 50;
  const [histHasMore, setHistHasMore] = useState(false);
  const [histLoadingMore, setHistLoadingMore] = useState(false);

  // Registry stats
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    lastUpdatedAt: string | null;
  } | null>(null);

  // ✅ Vote threshold (settings)
  const [voteThreshold, setVoteThreshold] = useState<number>(3);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // querystring for list
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

  // ✅ load settings (threshold)
  const loadSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/settings', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.success) setVoteThreshold(d.voteThreshold ?? 3);
    } catch {}
  }, []);

  // initial loads
  useEffect(() => {
    loadStats();
    loadSettings();
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load, loadStats, loadSettings]);

  // auto reload when params change
  useEffect(() => { load(); }, [load, params]);

  useEffect(() => { setPage(0); }, [q, status, limit]);

  // whoami + wallet sync
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) { router.replace('/admin/login?e=session'); return; }
        const { wallet: adminWallet } = await res.json();
        const current = publicKey?.toBase58() || null;
        if (!connected || !current || adminWallet !== current) {
          await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
          router.replace('/admin/login?e=wallet-changed');
        }
      } catch {
        router.replace('/admin/login?e=error');
      }
    })();
  }, [publicKey, connected, router]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const list = await fetchSolanaTokenList(); // cache’li util’in
        if (stop || !Array.isArray(list)) return;
        const m = new Map<string, { symbol?: string; name?: string }>();
        for (const t of list) {
          if (t?.address) m.set(t.address, { symbol: t.symbol, name: t.name });
        }
        setTokenListIndex(m);
      } finally {
        setListReady(true);
      }
    })();
    return () => { stop = true; };
  }, []);
  
  useEffect(() => {
    if (!listReady || !tokenListIndex || items.length === 0) return;
    setNameMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of items) {
        if (!next[it.mint]) {
          const hit = tokenListIndex.get(it.mint);
          if (hit) { next[it.mint] = hit; changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [listReady, tokenListIndex, items]);  

  // mount: localStorage → nameMap
  useEffect(() => {
    const cached = loadNameCache();
    if (cached && Object.keys(cached).length) {
      setNameMap(prev => ({ ...cached, ...prev }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveNameCache(nameMap);
  }, [nameMap]);  

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

  async function lookupOneMint(mint: string) {
    try {
      const meta = await fetchTokenMetadata(mint); // util’in var
      if (meta?.symbol || meta?.name) {
        setNameMap(prev => ({ ...prev, [mint]: { symbol: meta.symbol, name: meta.name } }));
        push('Metadata fetched', 'ok');
      } else {
        push('No metadata found', 'info');
      }
    } catch {
      push('Lookup failed', 'err');
    }
  }  

  /* -------- History fetching with pagination -------- */
  const fetchHistory = useCallback(
    async (mintVal: string, offset = 0) => {
      const url = `/api/admin/audit?mint=${encodeURIComponent(mintVal)}&limit=${HIST_LIMIT}&offset=${offset}`;
      const data = await api<{ success: true; items: AuditRow[] }>(url);
      return data.items || [];
    },
    []
  );

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
  /* -------------------------------------------------- */

  async function logout() {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      router.replace('/admin/login');
    }
  }

  // ✅ Save threshold (inline settings card)
  async function saveThreshold() {
    try {
      setSettingsMsg(null);
      setSavingThreshold(true);
      const r = await fetch('/api/admin/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteThreshold, changedBy: 'admin_ui' }),
      });
      const d = await r.json();
      if (d?.success) {
        setVoteThreshold(d.voteThreshold ?? voteThreshold);
        setSettingsMsg('✅ Saved');
        push('Threshold saved', 'ok');
        // tabloyu tazelemek istersen:
        await load();
      } else {
        setSettingsMsg(`❌ ${d?.error || 'Save failed'}`);
        push('Save failed', 'err');
      }
    } catch (e:any) {
      setSettingsMsg(`❌ ${e?.message || 'Save failed'}`);
      push('Save failed', 'err');
    } finally {
      setSavingThreshold(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <ToastViewport toasts={toasts} />

      {/* TOP BAR */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">🛡️ Token Management</h1>
        <div className="flex items-center gap-2">
          {/* NEW: Quick access to Audit Log */}
          <Link
            href="/admin/audit"
            className="bg-indigo-700 hover:bg-indigo-600 border border-indigo-500 rounded px-3 py-2 text-sm"
            title="View Admin Audit Log"
          >
            Audit Log
          </Link>

          <Link
            href="/admin/control"
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            Control
          </Link>
          
          <button
            onClick={() => router.push('/')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            title="Back to site"
          >
            ← Back to site
          </button>
          <button
            onClick={logout}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            Logout
          </button>

          {/* Bulk Update dialog button */}
          <BulkUpdateDialog
            onDone={async () => {
              await load();
              await loadStats();
              push('Bulk update completed', 'ok');
            }}
          />
        </div>
      </div>

      {/* Filters */}
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

      {/* ✅ Inline Settings Card (Vote Threshold) */}
      <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-4">
        <h2 className="font-semibold mb-2">Admin Settings</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Community Vote Threshold</label>
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={Number.isFinite(voteThreshold) ? voteThreshold : 1}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw)) { setVoteThreshold(1); return; }
              setVoteThreshold(clamp(Math.round(raw), 1, 50));
            }}
            className="w-24 px-2 py-1 rounded bg-gray-950 border border-gray-700"
          />

          <button
            onClick={saveThreshold}
            disabled={savingThreshold || !Number.isFinite(voteThreshold) || voteThreshold < 1 || voteThreshold > 50}
            className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {savingThreshold ? 'Saving…' : 'Save'}
          </button>
          {settingsMsg && <div className="text-xs text-gray-300">{settingsMsg}</div>}
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">
          Affects auto-deadcoin promotion (YES ≥ threshold).
        </div>
      </div>

      {/* 📊 Registry Stats — above the table */}
      {stats && (
        <div className="bg-gray-900 border border-gray-700 rounded p-4 mb-6">
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

      {error && <div className="text-red-400 mb-4">❌ {error}</div>}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="text-left p-2 w-[460px]">Mint</th>
              <th className="text-left p-2">Status</th>
              {/* ✅ New Votes column */}
              <th className="text-left p-2 w-[120px]">Votes</th>
              <th className="text-left p-2 w-[120px]">By</th>
              <th className="text-left p-2">Status At</th>
              <th className="text-left p-2 w-[520px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td className="p-3 text-gray-400" colSpan={6}>No records</td></tr>
            )}
            {items.map((it) => {
              const yesCount = typeof it.yes_count === 'number' ? it.yes_count : 0;
              return (
                <tr key={it.mint} className="border-b border-gray-800">
                  {/* Mint + Copy (button pinned right) */}
                  <td className="p-2 w-[460px]">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <div className="min-w-0">
                        <span className="font-mono truncate block" title={it.mint}>{it.mint}</span>
                        <div className="text-xs text-gray-400">
                          {nameMap[it.mint]?.symbol || nameMap[it.mint]?.name ? (
                            <>
                              {nameMap[it.mint]?.symbol ?? ''}
                              {nameMap[it.mint]?.name ? ` — ${nameMap[it.mint]?.name}` : ''}
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
                          if (ok) push('Copied mint', 'ok'); else push('Copy failed', 'err');
                        }}
                        className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-xs"
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

                  {/* ✅ Votes */}
                  <td className="p-2 w-[120px]" title={`YES ${yesCount}/${voteThreshold || 3}`}>
                    <VotesBadge yes={yesCount} threshold={voteThreshold || 3} />
                  </td>

                  {/* Updated By (short) */}
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
                  <td className="p-2 w-[520px]">
                    <div className="flex gap-2 whitespace-nowrap overflow-x-auto">
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* History Modal (with Load more) */}
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

                  {/* Load more */}
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
    </div>
  );
}
