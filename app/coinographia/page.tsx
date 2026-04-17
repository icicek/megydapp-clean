//app/coinographia/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppWalletBar from '@/components/AppWalletBar';

const STATUSES = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'] as const;
type TokenStatus = typeof STATUSES[number];

type TokenRow = {
    mint: string;
    status: TokenStatus;
    status_at: string | null;
    updated_by: string | null;
    reason: string | null;
    created_at: string;
    updated_at: string;
    symbol: string | null;
    name: string | null;
    logo_uri: string | null;
    classification_label: string;
};

type MetricCard = {
    key: string;
    label: string;
    value: number | null;
    unit: 'usd' | 'raw';
    description: string;
};

type HeatLevel = 'HOT' | 'TRENDING' | 'LIVE' | null;
type DiscoverySort = 'recent' | 'usd' | 'wallets' | 'coincarnations';

type DiscoveryRow = {
    mint: string;
    symbol: string | null;
    name: string | null;
    logo_uri: string | null;
    status: TokenStatus;
    total_coincarnations: number;
    unique_wallets: number;
    total_revived_usd: number;
    last_activity_at: string | null;
    recent_24h_count: number;
    recent_10m_count: number;
    heat_level: HeatLevel;
};

const STATUS_STYLES: Record<TokenStatus, string> = {
    healthy: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700',
    walking_dead: 'bg-amber-900/50 text-amber-200 border border-amber-700',
    deadcoin: 'bg-zinc-800 text-zinc-200 border border-zinc-700',
    redlist: 'bg-rose-900/50 text-rose-200 border border-rose-700',
    blacklist: 'bg-fuchsia-900/50 text-fuchsia-200 border border-fuchsia-700',
};

function StatusBadge({ status }: { status: TokenStatus }) {
    return (
        <span
            className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
                STATUS_STYLES[status],
            ].join(' ')}
        >
            {status}
        </span>
    );
}

function ClassificationBadge({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-gray-200 whitespace-nowrap">
            {label}
        </span>
    );
}

const HEAT_STYLES: Record<Exclude<HeatLevel, null>, string> = {
    HOT: 'border border-rose-500/30 bg-rose-500/15 text-rose-200',
    TRENDING: 'border border-amber-500/30 bg-amber-500/15 text-amber-200',
    LIVE: 'border border-cyan-500/30 bg-cyan-500/15 text-cyan-200',
};

function HeatBadge({ heat }: { heat: HeatLevel }) {
    if (!heat) return null;

    return (
        <span
            className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
                HEAT_STYLES[heat],
            ].join(' ')}
        >
            {heat}
        </span>
    );
}

function formatUsdCompact(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '$0';

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function formatNumberCompact(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '0';

    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function shortenMint(mint: string) {
    return `${mint.slice(0, 6)}…${mint.slice(-6)}`;
}

function formatUpdatedShort(value: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';

    return d.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatMetricValue(value: number | null, unit: 'usd' | 'raw') {
    if (value === null || !Number.isFinite(value)) return 'Not set';

    if (unit === 'usd') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(value);
    }

    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
    }).format(value);
}

function getMetricCardValue(metricCards: MetricCard[], key: string) {
    return metricCards.find((c) => c.key?.toLowerCase() === key)?.value ?? null;
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

function getCoincarnateButtonClass(status: TokenStatus, disabled: boolean) {
    const base =
        'border border-white/10 bg-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm';

    if (disabled) {
        return `${base} opacity-45 cursor-not-allowed text-gray-500`;
    }

    if (status === 'healthy') {
        return `${base} hover:border-emerald-400/40 hover:bg-emerald-500/12 hover:text-emerald-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.16)]`;
    }

    if (status === 'walking_dead') {
        return `${base} hover:border-amber-400/40 hover:bg-amber-500/12 hover:text-amber-200 hover:shadow-[0_0_20px_rgba(245,158,11,0.16)]`;
    }

    if (status === 'deadcoin') {
        return `${base} hover:border-zinc-300/20 hover:bg-zinc-500/10 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(113,113,122,0.16)]`;
    }

    return `${base} hover:border-white/20 hover:bg-white/[0.08]`;
}

function getDiscoveryCardClass(heat: HeatLevel, status: TokenStatus) {
    const base =
        'rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200';

    if (heat === 'HOT') {
        return `${base} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_0_28px_rgba(244,63,94,0.08)]`;
    }

    if (heat === 'TRENDING') {
        return `${base} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.08),0_0_24px_rgba(245,158,11,0.08)]`;
    }

    if (heat === 'LIVE') {
        return `${base} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_24px_rgba(34,211,238,0.08)]`;
    }

    if (status === 'healthy') {
        return `${base} hover:bg-white/[0.05]`;
    }

    if (status === 'walking_dead') {
        return `${base} hover:bg-white/[0.05]`;
    }

    if (status === 'deadcoin') {
        return `${base} hover:bg-white/[0.05]`;
    }

    return `${base} opacity-90`;
}

function getDiscoveryStoryLine(item: DiscoveryRow) {
    if (item.heat_level === 'HOT') {
        return `${formatNumberCompact(item.recent_10m_count)} recent hits in 10m · ${formatNumberCompact(item.unique_wallets)} wallets joined`;
    }

    if (item.heat_level === 'TRENDING') {
        return `${formatNumberCompact(item.recent_10m_count)} recent moves · ${formatNumberCompact(item.total_coincarnations)} Coincarnations`;
    }

    if (item.heat_level === 'LIVE') {
        return `${formatNumberCompact(item.recent_24h_count)} activity in 24h · ${formatNumberCompact(item.unique_wallets)} wallets joined`;
    }

    return `${formatNumberCompact(item.total_coincarnations)} Coincarnations · ${formatNumberCompact(item.unique_wallets)} wallets joined`;
}

function getDiscoverySortLabel(sort: DiscoverySort) {
    if (sort === 'usd') return 'Showing clusters ranked by revived USD';
    if (sort === 'wallets') return 'Showing clusters ranked by wallet participation';
    if (sort === 'coincarnations') return 'Showing clusters ranked by Coincarnation count';
    return 'Showing clusters ranked by recent activity';
}

function getMobileActionButtonClass(status: TokenStatus, disabled: boolean) {
    const base =
        'h-11 w-11 rounded-xl border border-white/10 bg-white/[0.04] text-lg font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition-all duration-200 flex items-center justify-center';

    if (disabled) {
        return `${base} opacity-45 cursor-not-allowed text-gray-500`;
    }

    if (status === 'healthy') {
        return `${base} hover:border-emerald-400/40 hover:bg-emerald-500/12 hover:text-emerald-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.16)]`;
    }

    if (status === 'walking_dead') {
        return `${base} hover:border-amber-400/40 hover:bg-amber-500/12 hover:text-amber-200 hover:shadow-[0_0_20px_rgba(245,158,11,0.16)]`;
    }

    if (status === 'deadcoin') {
        return `${base} hover:border-zinc-300/20 hover:bg-zinc-500/10 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(113,113,122,0.16)]`;
    }

    return `${base} hover:border-white/20 hover:bg-white/[0.08]`;
}

function handleCoincarnateClick(mint: string, status: TokenStatus) {
    if (status === 'redlist' || status === 'blacklist') return;

    try {
        sessionStorage.setItem('coincarnate_target_mint', mint);
    } catch { }

    window.location.href = '/';
}

export default function CoinographiaPage() {
    const [items, setItems] = useState<TokenRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [q, setQ] = useState('');
    const [status, setStatus] = useState<TokenStatus | ''>('');
    const [limit, setLimit] = useState(20);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [metricCards, setMetricCards] = useState<MetricCard[]>([]);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [discoveryItems, setDiscoveryItems] = useState<DiscoveryRow[]>([]);
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [discoveryError, setDiscoveryError] = useState<string | null>(null);
    const [discoverySort, setDiscoverySort] = useState<DiscoverySort>('recent');

    const params = useMemo(() => {
        const sp = new URLSearchParams();
        if (q.trim()) sp.set('q', q.trim());
        if (status) sp.set('status', status);
        sp.set('limit', String(limit));
        sp.set('offset', String(page * limit));
        return sp.toString();
    }, [q, status, limit, page]);

    async function load() {
        try {
            setLoading(true);
            setError(null);

            const res = await fetch(`/api/coinographia?${params}`, {
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const j = await res.json();

            setItems(j.items || []);
            setTotal(j.total || 0);
        } catch (e: any) {
            setError(e?.message || 'Load error');
        } finally {
            setLoading(false);
        }
    }

    async function loadMetrics() {
        try {
            setMetricsLoading(true);
            setMetricsError(null);

            const res = await fetch('/api/coinographia/metrics', {
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const j = await res.json();
            setMetricCards(Array.isArray(j.cards) ? j.cards : []);
        } catch (e: any) {
            setMetricsError(e?.message || 'Metrics load error');
        } finally {
            setMetricsLoading(false);
        }
    }

    async function loadDiscovery() {
        try {
            setDiscoveryLoading(true);
            setDiscoveryError(null);

            const sp = new URLSearchParams();
            if (q.trim()) sp.set('q', q.trim());
            if (status) sp.set('status', status);
            sp.set('limit', '12');
            sp.set('offset', '0');
            sp.set('sort', discoverySort);

            const res = await fetch(`/api/coinographia/discovery?${sp.toString()}`, {
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const j = await res.json();
            setDiscoveryItems(Array.isArray(j.items) ? j.items : []);
        } catch (e: any) {
            setDiscoveryError(e?.message || 'Discovery load error');
        } finally {
            setDiscoveryLoading(false);
        }
    }

    useEffect(() => {
        const id = setTimeout(() => {
            void load();
        }, 200);

        return () => clearTimeout(id);
    }, [params]);

    useEffect(() => {
        void loadMetrics();
    }, []);

    useEffect(() => {
        setPage(0);
    }, [q, status, limit]);

    useEffect(() => {
        const id = setTimeout(() => {
            void loadDiscovery();
        }, 180);

        return () => clearTimeout(id);
    }, [q, status, discoverySort]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="min-h-screen bg-[#090d15] text-white px-4 py-4 md:px-8 md:py-6">
            <div className="mx-auto max-w-7xl">
                <AppWalletBar className="mb-6 w-full" />

                <div className="relative mb-8 overflow-hidden rounded-[30px] border border-white/10 bg-[#0b1220] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_26%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.10),transparent_24%)]" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    <div className="pointer-events-none absolute -right-16 top-[-40px] h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-12 bottom-[-50px] h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />

                    <div className="relative p-6 md:p-7 xl:p-8">
                        <div className="flex flex-col gap-7 xl:flex-row xl:items-stretch xl:justify-between">
                            <div className="flex max-w-3xl flex-col xl:min-h-[100%] xl:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                                        Coinographia
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-300">
                                        Live Classification Layer
                                    </span>
                                </div>

                                <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl xl:text-[42px] xl:leading-[1.05]">
                                    The living map of token resurrection
                                </h1>

                                <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 sm:text-[15px]">
                                    Explore how tokens survive, weaken, or return through Coincarnation.
                                    Coinographia combines status logic, revival activity, and public thresholds into one living discovery surface.
                                </p>

                                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                                    <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.10)]">
                                        Healthy
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/12 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
                                        Walking Deadcoin
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-zinc-500/25 bg-zinc-500/12 px-3 py-1.5 text-xs font-medium text-zinc-200">
                                        Deadcoin
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/12 px-3 py-1.5 text-xs font-medium text-rose-200">
                                        Redlist
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-pink-500/25 bg-pink-500/12 px-3 py-1.5 text-xs font-medium text-pink-200">
                                        Blacklist
                                    </span>
                                </div>

                                <div className="mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <p className="text-xs leading-6 text-gray-400 sm:text-sm">
                                        Strong tokens remain above higher survival thresholds. Walking dead tokens fall into the danger zone without fully disappearing. Deadcoins drop below minimum survivability. Redlist and Blacklist directly override Coincarnation access.
                                    </p>
                                </div>
                            </div>

                            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:max-w-[560px]">
                                <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                            Healthy Min Volume
                                        </div>
                                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
                                    </div>

                                    <div className="mt-4 text-2xl font-bold text-white">
                                        {formatMetricValue(getMetricCardValue(metricCards, 'healthy_min_vol_usd'), 'usd')}
                                    </div>

                                    <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                        Minimum volume expected for healthy survival.
                                    </p>
                                </div>

                                <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(34,211,238,0.08)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                            Healthy Min Liquidity
                                        </div>
                                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
                                    </div>

                                    <div className="mt-4 text-2xl font-bold text-white">
                                        {formatMetricValue(getMetricCardValue(metricCards, 'healthy_min_liq_usd'), 'usd')}
                                    </div>

                                    <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                        Liquidity threshold required to remain strong.
                                    </p>
                                </div>

                                <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(245,158,11,0.08)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                            Walking Dead Min Volume
                                        </div>
                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]" />
                                    </div>

                                    <div className="mt-4 text-2xl font-bold text-white">
                                        {formatMetricValue(getMetricCardValue(metricCards, 'walking_dead_min_vol_usd'), 'usd')}
                                    </div>

                                    <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                        Minimum activity needed to avoid the deadcoin zone.
                                    </p>
                                </div>

                                <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(244,63,94,0.08)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                            Walking Dead Min Liquidity
                                        </div>
                                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.9)]" />
                                    </div>

                                    <div className="mt-4 text-2xl font-bold text-white">
                                        {formatMetricValue(getMetricCardValue(metricCards, 'walking_dead_min_liq_usd'), 'usd')}
                                    </div>

                                    <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                        Survival liquidity line before falling below minimum viability.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="min-w-0 flex-1">
                            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                Search Token
                            </label>

                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                                    ⌕
                                </span>

                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search token (symbol, name or mint)"
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1526] pl-10 pr-4 text-sm text-white outline-none transition-all duration-200 placeholder:text-gray-500 focus:border-cyan-400/40 focus:bg-[#101a2e] focus:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_0_24px_rgba(34,211,238,0.10)]"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px] xl:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    Status
                                </label>

                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as TokenStatus | '')}
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1526] px-4 text-sm text-white outline-none transition-all duration-200 focus:border-cyan-400/40 focus:bg-[#101a2e] focus:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_0_24px_rgba(34,211,238,0.10)]"
                                >
                                    <option value="">All statuses</option>
                                    {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    Rows
                                </label>

                                <select
                                    value={limit}
                                    onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1526] px-4 text-sm text-white outline-none transition-all duration-200 focus:border-cyan-400/40 focus:bg-[#101a2e] focus:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_0_24px_rgba(34,211,238,0.10)]"
                                >
                                    {[10, 20, 50, 100].map((n) => (
                                        <option key={n} value={n}>
                                            {n}/page
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex max-w-3xl flex-col xl:min-h-[100%] xl:justify-between">
                            <h2 className="text-lg font-semibold text-white">Live Discovery</h2>
                            <p className="mt-2 text-sm text-gray-300">
                                Explore the most active Coincarnation clusters. This layer highlights how often a token
                                has been coincarnated, how much value it has revived, how many unique wallets joined,
                                and whether it is currently live, trending, or hot.
                            </p>
                            <p className="mt-3 text-xs text-gray-400">
                                {getDiscoverySortLabel(discoverySort)}
                                {status ? ` · Filtered by ${status}` : ''}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={discoverySort}
                                onChange={(e) => setDiscoverySort(e.target.value as DiscoverySort)}
                                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
                            >
                                <option value="recent">Most recent</option>
                                <option value="usd">Most revived USD</option>
                                <option value="wallets">Most wallets</option>
                                <option value="coincarnations">Most Coincarnations</option>
                            </select>

                            <button
                                onClick={() => void loadDiscovery()}
                                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                            >
                                Refresh Discovery
                            </button>
                        </div>
                    </div>

                    {discoveryError && (
                        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {discoveryError}
                        </div>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {discoveryLoading && discoveryItems.length === 0 ? (
                            [...Array(6)].map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 animate-pulse"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-11 w-11 rounded-full bg-white/10" />
                                        <div className="min-w-0 flex-1">
                                            <div className="h-4 w-28 rounded bg-white/10" />
                                            <div className="mt-2 h-3 w-40 rounded bg-white/10" />
                                        </div>
                                    </div>

                                    <div className="mt-4 flex gap-2">
                                        <div className="h-6 w-16 rounded-full bg-white/10" />
                                        <div className="h-6 w-20 rounded-full bg-white/10" />
                                    </div>

                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        <div className="h-14 rounded-xl bg-white/10" />
                                        <div className="h-14 rounded-xl bg-white/10" />
                                        <div className="h-14 rounded-xl bg-white/10" />
                                    </div>
                                </div>
                            ))
                        ) : discoveryItems.length > 0 ? (
                            discoveryItems.map((it) => {
                                const isDisabled = it.status === 'redlist' || it.status === 'blacklist';

                                return (
                                    <div
                                        key={it.mint}
                                        className={getDiscoveryCardClass(it.heat_level, it.status)}
                                    >
                                        <div className="flex items-start gap-3">
                                            {it.logo_uri ? (
                                                <img
                                                    src={it.logo_uri}
                                                    alt={it.symbol || it.name || it.mint}
                                                    className="h-11 w-11 rounded-full border border-white/10 object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="h-11 w-11 rounded-full border border-white/10 bg-white/5 shrink-0" />
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[15px] font-semibold leading-5 text-white">
                                                    {it.symbol || 'Unknown Symbol'}
                                                    {it.name ? ` — ${it.name}` : ''}
                                                </div>

                                                <div
                                                    className="mt-1 truncate font-mono text-[11px] text-gray-400"
                                                    title={it.mint}
                                                >
                                                    {shortenMint(it.mint)}
                                                </div>

                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <StatusBadge status={it.status} />
                                                    <HeatBadge heat={it.heat_level} />
                                                </div>

                                                <div className="mt-3 text-[12px] leading-5 text-gray-300">
                                                    {getDiscoveryStoryLine(it)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.08em] text-gray-500">
                                                    Coincarnations
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-white">
                                                    {formatNumberCompact(it.total_coincarnations)}
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.08em] text-gray-500">
                                                    Revived USD
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-white">
                                                    {formatUsdCompact(it.total_revived_usd)}
                                                </div>
                                            </div>

                                            <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:col-span-1">
                                                <div className="text-[10px] uppercase tracking-[0.08em] text-gray-500">
                                                    Wallets
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-white">
                                                    {formatNumberCompact(it.unique_wallets)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-1 text-[11px] text-gray-400 sm:flex sm:items-center sm:justify-between sm:gap-3">
                                            <div>
                                                24h activity:{' '}
                                                <span className="text-gray-200">
                                                    {formatNumberCompact(it.recent_24h_count)}
                                                </span>
                                            </div>

                                            <div>
                                                Revived:{' '}
                                                <span className="text-gray-200">
                                                    {formatUsdCompact(it.total_revived_usd)}
                                                </span>
                                            </div>

                                            <div>
                                                Last activity:{' '}
                                                <span className="text-gray-200">
                                                    {formatUpdatedShort(it.last_activity_at)}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            disabled={isDisabled}
                                            onClick={() => handleCoincarnateClick(it.mint, it.status)}
                                            className={[
                                                'mt-4 w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200',
                                                getCoincarnateButtonClass(it.status, isDisabled),
                                            ].join(' ')}
                                            title={
                                                isDisabled
                                                    ? 'Coincarnation is disabled for redlisted or blacklisted tokens.'
                                                    : `Coincarnate ${it.symbol ? `$${it.symbol}` : 'this token'}`
                                            }
                                        >
                                            {isDisabled
                                                ? 'Coincarnation Disabled'
                                                : it.symbol
                                                    ? `Coincarnate $${it.symbol}`
                                                    : 'Coincarnate'}
                                        </button>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
                                No discovery clusters found yet.
                            </div>
                        )}
                    </div>
                </div>

                <div className="mb-4 flex items-center justify-between text-sm text-gray-400">
                    <div>{loading ? 'Loading…' : `${total} token(s) found`}</div>
                    <button
                        onClick={() => void load()}
                        className="rounded border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                    >
                        Refresh
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                    {items.length === 0 && !loading && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-gray-400">
                            No records found.
                        </div>
                    )}

                    {items.map((it) => {
                        const isDisabled = it.status === 'redlist' || it.status === 'blacklist';

                        return (
                            <div
                                key={it.mint}
                                className="rounded-2xl border border-white/10 bg-white/5 p-4"
                            >
                                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                                    <div className="min-w-0 flex items-start gap-3">
                                        {it.logo_uri ? (
                                            <img
                                                src={it.logo_uri}
                                                alt={it.symbol || it.name || it.mint}
                                                className="mt-0.5 h-10 w-10 rounded-full border border-white/10 object-cover shrink-0"
                                            />
                                        ) : (
                                            <div className="mt-0.5 h-10 w-10 rounded-full border border-white/10 bg-white/5 shrink-0" />
                                        )}

                                        <div className="min-w-0">
                                            <div className="truncate text-[15px] font-semibold leading-5">
                                                {it.symbol || 'Unknown Symbol'}
                                                {it.name ? ` — ${it.name}` : ''}
                                            </div>

                                            <div className="mt-1 flex items-center gap-2 min-w-0">
                                                <div className="truncate font-mono text-[11px] text-gray-400" title={it.mint}>
                                                    {shortenMint(it.mint)}
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        await copyToClipboard(it.mint);
                                                    }}
                                                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                                                    title="Copy mint"
                                                    aria-label="Copy mint"
                                                >
                                                    copy
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-start gap-1 min-w-0">
                                        <StatusBadge status={it.status} />
                                        <div className="text-[11px] text-gray-500 whitespace-nowrap">
                                            {formatUpdatedShort(it.updated_at)}
                                        </div>
                                    </div>

                                    <button
                                        disabled={isDisabled}
                                        onClick={() => handleCoincarnateClick(it.mint, it.status)}
                                        className={getMobileActionButtonClass(it.status, isDisabled)}
                                        title={
                                            isDisabled
                                                ? 'Coincarnation is disabled for redlisted or blacklisted tokens.'
                                                : `Coincarnate ${it.symbol ? `$${it.symbol}` : 'this token'}`
                                        }
                                    >
                                        ↗
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                    <table className="min-w-full text-sm">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="w-[44%] p-3 text-left text-sm">Token</th>
                                <th className="w-[14%] p-3 text-center text-sm">Status</th>
                                <th className="w-[18%] p-3 text-center text-sm">Details</th>
                                <th className="w-[24%] p-3 text-center text-sm">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-gray-400">
                                        No records found.
                                    </td>
                                </tr>
                            )}

                            {items.map((it) => {
                                const isDisabled = it.status === 'redlist' || it.status === 'blacklist';
                                const tokenLabel = it.symbol ? `$${it.symbol}` : 'this token';

                                return (
                                    <tr key={it.mint} className="border-t border-white/5 align-middle">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {it.logo_uri ? (
                                                    <img
                                                        src={it.logo_uri}
                                                        alt={it.symbol || it.name || it.mint}
                                                        className="h-10 w-10 rounded-full border border-white/10 object-cover shrink-0"
                                                    />
                                                ) : (
                                                    <div className="h-10 w-10 rounded-full border border-white/10 bg-white/5 shrink-0" />
                                                )}

                                                <div className="min-w-0">
                                                    <div className="truncate text-[15px] font-semibold leading-5">
                                                        {it.symbol || 'Unknown Symbol'}
                                                        {it.name ? ` — ${it.name}` : ''}
                                                    </div>

                                                    <div className="mt-1 flex items-center gap-2 min-w-0">
                                                        <div className="truncate font-mono text-[11px] text-gray-400" title={it.mint}>
                                                            {shortenMint(it.mint)}
                                                        </div>

                                                        <button
                                                            onClick={async () => {
                                                                await copyToClipboard(it.mint);
                                                            }}
                                                            className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                                                            title="Copy mint"
                                                            aria-label="Copy mint"
                                                        >
                                                            copy
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-4 text-center align-middle">
                                            <div className="flex justify-center">
                                                <StatusBadge status={it.status} />
                                            </div>
                                        </td>

                                        <td className="p-4 text-center align-middle">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <ClassificationBadge label={it.classification_label} />
                                                <div className="text-[11px] text-gray-500 whitespace-nowrap">
                                                    {formatUpdatedShort(it.updated_at)}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-4 text-center align-middle">
                                            <div className="flex justify-center">
                                                <button
                                                    disabled={isDisabled}
                                                    onClick={() => handleCoincarnateClick(it.mint, it.status)}
                                                    className={[
                                                        'w-[165px] rounded-xl px-3 py-2 text-[13px] font-semibold tracking-[0.01em] transition-all duration-200 text-center whitespace-nowrap overflow-hidden text-ellipsis',
                                                        getCoincarnateButtonClass(it.status, isDisabled),
                                                    ].join(' ')}
                                                    title={
                                                        isDisabled
                                                            ? 'Coincarnation is disabled for redlisted or blacklisted tokens.'
                                                            : `Coincarnate ${tokenLabel}`
                                                    }
                                                >
                                                    {it.symbol ? `Coincarnate $${it.symbol}` : 'Coincarnate'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-gray-400">
                        Page {page + 1} / {totalPages}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="rounded border border-white/10 bg-white/5 px-3 py-2 disabled:opacity-50"
                        >
                            Previous
                        </button>

                        <button
                            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                            disabled={page + 1 >= totalPages}
                            className="rounded border border-white/10 bg-white/5 px-3 py-2 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}