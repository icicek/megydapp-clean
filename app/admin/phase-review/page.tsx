//app/admin/phase-review/page.tsx
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useAdminWalletGuard from '@/hooks/useAdminWalletGuard';

const STATUSES = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

type PhaseTokenRow = {
    phase_id: number;
    phase_no: number;
    phase_name: string;
    phase_status: string;
    mint: string;
    token_symbol: string | null;
    contribution_count: number;
    wallet_count: number;
    usd_total: string | number;
    megy_total: string | number;
    status: TokenStatus;
    yes_count: number;
    reviewed: boolean;
    reviewed_at: string | null;
    reviewed_by: string | null;
    review_note: string | null;
    global_review_rule?: string | null;
    global_review_note?: string | null;
};

type PhaseOption = {
    phase_id: number;
    phase_no: number;
    name: string;
    status?: string;
    token_count?: number;
    reviewed_count?: number;
    unreviewed_count?: number;
};

type ReviewRule = {
    id: number;
    mint: string;
    rule_type: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

const CARD =
    'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm';

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

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = getCsrfToken();

    const headers = new Headers(init.headers || {});
    headers.set('X-Requested-With', 'fetch');

    if (token) {
        headers.set('x-csrf-token', token);
    }

    const res = await fetch(url, {
        cache: 'no-store',
        credentials: 'include',
        ...init,
        headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data as T;
}

function shortMint(v: string) {
    if (!v) return '-';
    return v.length > 14 ? `${v.slice(0, 6)}...${v.slice(-4)}` : v;
}

function fmtUsd(v: unknown) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return '-';
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtNum(v: unknown) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function statusClass(status: string) {
    if (status === 'healthy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    if (status === 'walking_dead') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    if (status === 'deadcoin') return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200';
    if (status === 'redlist') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    if (status === 'blacklist') return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200';
    return 'border-white/10 bg-white/5 text-white/70';
}

function PhaseReviewContent() {
    const searchParams = useSearchParams();
    const initialPhaseId = searchParams.get('phaseId') || '';

    const {
        loading: adminGuardLoading,
        canRunCriticalAdminAction,
        guardMessage,
        walletMatches,
        sessionWallet,
        connectedWallet,
    } = useAdminWalletGuard();

    const [phaseId, setPhaseId] = useState(initialPhaseId);
    const [phaseOptions, setPhaseOptions] = useState<PhaseOption[]>([]);
    const [phaseOptionsLoading, setPhaseOptionsLoading] = useState(false);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [review, setReview] = useState<'all' | 'reviewed' | 'unreviewed'>('unreviewed');

    const [items, setItems] = useState<PhaseTokenRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [busyMint, setBusyMint] = useState<string | null>(null);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [trustedOpen, setTrustedOpen] = useState(false);
    const [trustedRules, setTrustedRules] = useState<ReviewRule[]>([]);
    const [trustedLoading, setTrustedLoading] = useState(false);

    const params = useMemo(() => {
        const sp = new URLSearchParams();
        if (q.trim()) sp.set('q', q.trim());
        if (status) sp.set('status', status);
        sp.set('review', review);
        sp.set('limit', '200');
        return sp.toString();
    }, [q, status, review]);

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

    async function loadPhaseOptions() {
        try {
            setPhaseOptionsLoading(true);

            const data = await api<{
                success: boolean;
                phases: PhaseOption[];
            }>('/api/admin/phase-review/phases');

            const phases = Array.isArray(data.phases) ? data.phases : [];

            setPhaseOptions(
                phases
                    .slice()
                    .sort((a, b) => Number(b.phase_no ?? 0) - Number(a.phase_no ?? 0))
            );

            if (!phaseId && phases.length > 0) {
                const firstReviewing =
                    phases.find((p) => String(p.status || '').toLowerCase() === 'reviewing') ||
                    phases[0];

                setPhaseId(String(firstReviewing.phase_id));
            }
        } catch {
            setPhaseOptions([]);
        } finally {
            setPhaseOptionsLoading(false);
        }
    }

    async function load() {
        const id = Number(phaseId);

        if (!Number.isFinite(id) || id <= 0) {
            setItems([]);
            setMsg('Enter a valid phase ID.');
            return;
        }

        try {
            setLoading(true);
            setMsg(null);

            const data = await api<{
                success: boolean;
                items: PhaseTokenRow[];
            }>(`/api/admin/phases/${id}/tokens?${params}`);

            const nextItems = Array.isArray(data.items) ? data.items : [];
            setItems(nextItems);

            setReviewNotes((prev) => {
                const copy = { ...prev };

                for (const item of nextItems) {
                    if (copy[item.mint] === undefined) {
                        copy[item.mint] = item.review_note || '';
                    }
                }

                return copy;
            });
        } catch (e: any) {
            setItems([]);
            setMsg(`❌ ${e?.message || 'Load failed'}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (adminGuardLoading) return;
        void loadPhaseOptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminGuardLoading]);

    useEffect(() => {
        if (adminGuardLoading) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminGuardLoading, phaseId, params]);

    async function updateStatus(mint: string, nextStatus: TokenStatus) {
        if (!ensureCriticalAdminAccess()) return;

        try {
            setBusyMint(mint);
            setMsg(null);

            await api('/api/admin/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mint,
                    status: nextStatus,
                    reason: `phase review ${phaseId}`,
                    meta: {
                        source: 'phase_review',
                        phase_id: Number(phaseId),
                    },
                }),
            });

            setMsg(`✅ ${shortMint(mint)} → ${nextStatus}`);
            await load();
        } catch (e: any) {
            setMsg(`❌ ${e?.message || 'Status update failed'}`);
        } finally {
            setBusyMint(null);
        }
    }

    async function markReviewed(mint: string, reviewed: boolean) {
        if (!ensureCriticalAdminAccess()) return;

        try {
            setBusyMint(mint);
            setMsg(null);

            await api(`/api/admin/phases/${Number(phaseId)}/tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mint,
                    reviewed,
                    note: reviewNotes[mint] || '',
                }),
            });

            setMsg(reviewed ? `✅ Reviewed: ${shortMint(mint)}` : `↩️ Unreviewed: ${shortMint(mint)}`);
            await load();
        } catch (e: any) {
            setMsg(`❌ ${e?.message || 'Review update failed'}`);
        } finally {
            setBusyMint(null);
        }
    }

    async function skipFutureReviews(mint: string) {
        if (!ensureCriticalAdminAccess()) return;

        try {
            setBusyMint(mint);
            setMsg(null);

            await api(`/api/admin/phases/${Number(phaseId)}/tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mint,
                    skip_future_reviews: true,
                    note: reviewNotes[mint] || 'Trusted mint · skip future phase reviews',
                }),
            });

            setMsg(`✅ Future reviews skipped for: ${shortMint(mint)}`);
            await load();
            await loadPhaseOptions();
        } catch (e: any) {
            setMsg(`❌ ${e?.message || 'Skip future reviews failed'}`);
        } finally {
            setBusyMint(null);
        }
    }

    async function loadTrustedRules() {
        try {
            setTrustedLoading(true);

            const data = await api<{
                success: boolean;
                rules: ReviewRule[];
            }>('/api/admin/phase-review/rules');

            setTrustedRules(Array.isArray(data.rules) ? data.rules : []);
        } catch (e: any) {
            setMsg(`❌ ${e?.message || 'Trusted mints load failed'}`);
        } finally {
            setTrustedLoading(false);
        }
    }

    async function removeTrustedRule(mint: string) {
        if (!ensureCriticalAdminAccess()) return;

        try {
            setBusyMint(mint);
            setMsg(null);

            await api(`/api/admin/phase-review/rules?mint=${encodeURIComponent(mint)}`, {
                method: 'DELETE',
            });

            setMsg(`↩️ Future reviews restored for: ${shortMint(mint)}`);

            await loadTrustedRules();
            await load();
            await loadPhaseOptions();
        } catch (e: any) {
            setMsg(`❌ ${e?.message || 'Restore reviews failed'}`);
        } finally {
            setBusyMint(null);
        }
    }

    async function openTrustedMints() {
        setTrustedOpen(true);
        await loadTrustedRules();
    }

    const summary = useMemo(() => {
        const total = items.length;
        const reviewedCount = items.filter((x) => x.reviewed).length;
        const unreviewedCount = total - reviewedCount;
        const usd = items.reduce((sum, x) => sum + Number(x.usd_total ?? 0), 0);

        return { total, reviewedCount, unreviewedCount, usd };
    }, [items]);

    return (
        <main className="min-h-screen bg-[#090d15] text-white">
            <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Phase Token Review</h1>
                        <p className="mt-1 text-xs text-white/60">
                            Review tokens coincarned in a selected phase and quickly update their registry status.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => void openTrustedMints()}
                            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-500/15"
                        >
                            Manage Trusted Mints
                        </button>

                        <button
                            onClick={() => void load()}
                            disabled={loading}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {!adminGuardLoading && !walletMatches && (
                    <div className={`${CARD} text-sm text-yellow-100 border-yellow-500/20 bg-yellow-500/10`}>
                        <div className="font-medium">Admin wallet verification required</div>
                        <div className="mt-1 text-xs text-yellow-200/80">
                            Critical actions require the connected wallet to match the active admin session wallet.
                        </div>
                        <div className="mt-2 text-xs text-yellow-200/80 space-y-1">
                            {sessionWallet ? <div>Session wallet: {sessionWallet}</div> : null}
                            {connectedWallet ? <div>Connected wallet: {connectedWallet}</div> : null}
                        </div>
                    </div>
                )}

                {msg && <div className={`${CARD} text-sm whitespace-pre-line`}>{msg}</div>}

                <section className={CARD}>
                    <div className="grid gap-3 md:grid-cols-[160px_1fr_180px_180px_auto]">
                        <div>
                            <label className="mb-1 block text-xs text-white/50">Phase</label>
                            <select
                                value={phaseId}
                                onChange={(e) => setPhaseId(e.target.value)}
                                disabled={phaseOptionsLoading}
                                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-blue-400/50"
                            >
                                <option value="">
                                    {phaseOptionsLoading ? 'Loading phases…' : 'Select phase'}
                                </option>

                                {phaseOptions.map((p) => (
                                    <option key={p.phase_id} value={String(p.phase_id)}>
                                        #{p.phase_no} — {p.name || '(unnamed)'} [{p.status || 'planned'}] · {p.unreviewed_count ?? 0}/{p.token_count ?? 0} left
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-white/50">Search</label>
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="mint or symbol"
                                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-blue-400/50"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-white/50">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                            >
                                <option value="">all</option>
                                {STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-white/50">Review</label>
                            <select
                                value={review}
                                onChange={(e) => setReview(e.target.value as any)}
                                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                            >
                                <option value="unreviewed">unreviewed</option>
                                <option value="reviewed">reviewed</option>
                                <option value="all">all</option>
                            </select>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={() => void load()}
                                disabled={loading}
                                className="h-10 w-full rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15 disabled:opacity-50"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    <div className={CARD}>
                        <div className="text-xs text-white/50">Visible tokens</div>
                        <div className="mt-2 text-2xl font-semibold">{summary.total}</div>
                    </div>

                    <div className={CARD}>
                        <div className="text-xs text-white/50">Unreviewed</div>
                        <div className="mt-2 text-2xl font-semibold text-yellow-200">{summary.unreviewedCount}</div>
                    </div>

                    <div className={CARD}>
                        <div className="text-xs text-white/50">Reviewed</div>
                        <div className="mt-2 text-2xl font-semibold text-emerald-200">{summary.reviewedCount}</div>
                    </div>

                    <div className={CARD}>
                        <div className="text-xs text-white/50">Visible USD total</div>
                        <div className="mt-2 text-2xl font-semibold">{fmtUsd(summary.usd)}</div>
                    </div>
                </section>

                <section className={CARD}>
                    {loading ? (
                        <div className="text-sm text-white/60">Loading…</div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-white/60">No phase token records found.</div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/10">
                            <table className="min-w-[1120px] w-full text-left text-sm">
                                <thead className="bg-white/5 text-white/60">
                                    <tr>
                                        <th className="px-4 py-3">Review</th>
                                        <th className="px-4 py-3">Token</th>
                                        <th className="px-4 py-3">Mint</th>
                                        <th className="px-4 py-3">Contributions</th>
                                        <th className="px-4 py-3">Wallets</th>
                                        <th className="px-4 py-3">USD</th>
                                        <th className="px-4 py-3">MEGY</th>
                                        <th className="px-4 py-3">Votes</th>
                                        <th className="px-4 py-3">Current Status</th>
                                        <th className="px-4 py-3">Note</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {items.map((row) => {
                                        const busy = busyMint === row.mint;

                                        return (
                                            <tr key={row.mint} className="border-t border-white/10 align-top hover:bg-white/[0.03]">
                                                <td className="px-4 py-3">
                                                    {row.reviewed ? (
                                                        <div className="space-y-2">
                                                            <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                                                                reviewed
                                                            </span>
                                                            <button
                                                                disabled={busy}
                                                                onClick={() => markReviewed(row.mint, false)}
                                                                className="block rounded bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 disabled:opacity-50"
                                                            >
                                                                undo
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => markReviewed(row.mint, true)}
                                                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                                                        >
                                                            Mark Reviewed
                                                        </button>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="font-semibold">{row.token_symbol || 'Unknown'}</div>
                                                    <div className="mt-1 text-[11px] text-white/45">
                                                        Phase #{row.phase_no} — {row.phase_name}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 font-mono text-xs">
                                                    <div className="space-y-2">
                                                        <button
                                                            onClick={async () => {
                                                                await navigator.clipboard?.writeText(row.mint);
                                                                setMsg(`✅ Mint copied: ${shortMint(row.mint)}`);
                                                            }}
                                                            className="text-sky-200 hover:underline"
                                                            title="Copy mint address"
                                                        >
                                                            {shortMint(row.mint)}
                                                        </button>

                                                        <div className="flex flex-wrap gap-2">
                                                            <a
                                                                href={`https://dexscreener.com/search?q=${row.mint}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                                            >
                                                                Dex Search
                                                            </a>

                                                            <a
                                                                href={`https://birdeye.so/token/${row.mint}?chain=solana`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                                            >
                                                                Birdeye
                                                            </a>

                                                            <a
                                                                href={`https://solscan.io/token/${row.mint}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                                            >
                                                                Solscan
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    window.open(
                                                                        `https://dexscreener.com/search?q=${row.mint}`,
                                                                        '_blank'
                                                                    );

                                                                    setTimeout(() => {
                                                                        window.open(
                                                                            `https://birdeye.so/token/${row.mint}?chain=solana`,
                                                                            '_blank'
                                                                        );
                                                                    }, 50);

                                                                    setTimeout(() => {
                                                                        window.open(
                                                                            `https://solscan.io/token/${row.mint}`,
                                                                            '_blank'
                                                                        );
                                                                    }, 100);
                                                                }}
                                                                className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-500/15"
                                                            >
                                                                Open All
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">{row.contribution_count}</td>
                                                <td className="px-4 py-3">{row.wallet_count}</td>
                                                <td className="px-4 py-3">{fmtUsd(row.usd_total)}</td>
                                                <td className="px-4 py-3">{fmtNum(row.megy_total)}</td>
                                                <td className="px-4 py-3">
                                                    <span className="rounded-full bg-white/10 px-2 py-1 text-xs">
                                                        YES {row.yes_count}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="space-y-2">
                                                        <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${statusClass(row.status)}`}>
                                                            {row.status}
                                                        </span>

                                                        <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                                                            {STATUSES.map((s) => (
                                                                <button
                                                                    key={s}
                                                                    disabled={busy || row.status === s}
                                                                    onClick={() => updateStatus(row.mint, s)}
                                                                    className={`rounded-md border px-2 py-1 text-[10px] hover:opacity-90 disabled:opacity-40 ${statusClass(s)}`}
                                                                >
                                                                    {s}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <textarea
                                                        value={reviewNotes[row.mint] || ''}
                                                        onChange={(e) =>
                                                            setReviewNotes((prev) => ({
                                                                ...prev,
                                                                [row.mint]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="Liquidity weak, suspicious holders, fake volume..."
                                                        className="min-h-[72px] w-56 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 outline-none focus:border-violet-400/50"
                                                    />

                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => markReviewed(row.mint, true)}
                                                            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                                                        >
                                                            Save & Reviewed
                                                        </button>

                                                        {row.reviewed && (
                                                            <button
                                                                disabled={busy}
                                                                onClick={() => markReviewed(row.mint, true)}
                                                                className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-500/15 disabled:opacity-50"
                                                            >
                                                                Save Note
                                                            </button>
                                                        )}
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => skipFutureReviews(row.mint)}
                                                            className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-500/15 disabled:opacity-50"
                                                            title="Hide this mint from future phase review lists"
                                                        >
                                                            Skip Future
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
            {trustedOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f18] shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                            <div>
                                <h2 className="text-lg font-semibold">Trusted Mints</h2>
                                <p className="mt-1 text-xs text-white/50">
                                    These mint addresses are hidden from future phase review lists.
                                </p>
                            </div>

                            <button
                                onClick={() => setTrustedOpen(false)}
                                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                            >
                                Close
                            </button>
                        </div>

                        <div className="max-h-[60vh] overflow-auto p-5">
                            {trustedLoading ? (
                                <div className="text-sm text-white/60">Loading trusted mints…</div>
                            ) : trustedRules.length === 0 ? (
                                <div className="text-sm text-white/60">No trusted mints yet.</div>
                            ) : (
                                <div className="space-y-3">
                                    {trustedRules.map((rule) => (
                                        <div
                                            key={rule.id}
                                            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0">
                                                    <div className="font-mono text-xs text-sky-200">
                                                        {rule.mint}
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                                                        <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-200">
                                                            {rule.rule_type}
                                                        </span>
                                                        <span>by {rule.created_by || 'unknown'}</span>
                                                        <span>{new Date(rule.created_at).toLocaleString()}</span>
                                                    </div>

                                                    {rule.note && (
                                                        <div className="mt-2 text-xs text-white/70">
                                                            {rule.note}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex shrink-0 gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            await navigator.clipboard?.writeText(rule.mint);
                                                            setMsg(`✅ Mint copied: ${shortMint(rule.mint)}`);
                                                        }}
                                                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                                    >
                                                        Copy
                                                    </button>

                                                    <button
                                                        disabled={busyMint === rule.mint}
                                                        onClick={() => removeTrustedRule(rule.mint)}
                                                        className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
                                                    >
                                                        Restore Reviews
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
export default function PhaseReviewPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-[#090d15] text-white">
                    <div className="mx-auto max-w-7xl px-6 py-8">
                        <div className="rounded-2xl border border-white/10 bg-[#0b0f18] p-5 text-sm text-white/70">
                            Loading phase review…
                        </div>
                    </div>
                </main>
            }
        >
            <PhaseReviewContent />
        </Suspense>
    );
}