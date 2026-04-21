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
    first_seen_at: string | null;
    last_activity_at: string | null;
    recent_24h_count: number;
    recent_10m_count: number;
    activity_score: number;
    heat_level: HeatLevel;
    rank_reason:
    | 'highest_revived_usd'
    | 'most_wallets'
    | 'most_coincarnations'
    | 'hot_now'
    | 'trending_now'
    | 'live_now'
    | 'recent_cluster'
    | 'search_pioneer';
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
                'inline-flex items-center rounded-full px-2 py-[5px] text-[10px] sm:text-[11px] font-semibold whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
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
                'inline-flex items-center rounded-full px-2 py-[5px] text-[10px] sm:text-[11px] font-semibold whitespace-nowrap shadow-[0_0_18px_rgba(255,255,255,0.04)]',
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

    return d.toLocaleString('en-GB', {
        month: 'short',
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
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const isCoarsePointer =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches;

        if (isCoarsePointer) return false;

        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function getCoincarnateButtonClass(status: TokenStatus, disabled: boolean) {
    const base =
        'border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.035))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm';

    if (disabled) {
        return `${base} opacity-45 cursor-not-allowed text-gray-500`;
    }

    if (status === 'healthy') {
        return `${base} hover:border-emerald-400/40 hover:bg-emerald-500/12 hover:text-emerald-200 hover:shadow-[0_0_22px_rgba(16,185,129,0.18)]`;
    }

    if (status === 'walking_dead') {
        return `${base} hover:border-amber-400/40 hover:bg-amber-500/12 hover:text-amber-200 hover:shadow-[0_0_22px_rgba(245,158,11,0.18)]`;
    }

    if (status === 'deadcoin') {
        return `${base} hover:border-zinc-300/20 hover:bg-zinc-500/10 hover:text-zinc-100 hover:shadow-[0_0_22px_rgba(113,113,122,0.18)]`;
    }

    return `${base} hover:border-white/20 hover:bg-white/[0.08]`;
}

function getDiscoveryCardClass(heat: HeatLevel, status: TokenStatus) {
    const base =
        'group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,27,45,0.88),rgba(11,16,28,0.94))] p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_14px_34px_rgba(2,6,23,0.24)] transition-all duration-300 hover:-translate-y-[3px] hover:border-cyan-300/20 active:scale-[0.995]';

    const sheen =
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.06)_18%,transparent_36%)] after:translate-x-[-120%] hover:after:translate-x-[120%] after:transition-transform after:duration-700';

    if (heat === 'HOT') {
        return `${base} ${sheen} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(244,63,94,0.10),0_0_34px_rgba(244,63,94,0.14)] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.16),transparent_62%)] before:opacity-80 before:pointer-events-none`;
    }

    if (heat === 'TRENDING') {
        return `${base} ${sheen} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.10),0_0_30px_rgba(245,158,11,0.13)] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.14),transparent_62%)] before:opacity-80 before:pointer-events-none`;
    }

    if (heat === 'LIVE') {
        return `${base} ${sheen} hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(34,211,238,0.10),0_0_30px_rgba(34,211,238,0.13)] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_62%)] before:opacity-80 before:pointer-events-none`;
    }

    if (status === 'healthy') {
        return `${base} ${sheen} hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(16,185,129,0.08)]`;
    }

    if (status === 'walking_dead') {
        return `${base} ${sheen} hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(245,158,11,0.08)]`;
    }

    if (status === 'deadcoin') {
        return `${base} ${sheen} hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(113,113,122,0.08)]`;
    }

    return `${base} ${sheen} opacity-90`;
}

function getPioneerCardAccentClass() {
    return 'ring-1 ring-violet-400/30 border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] shadow-[0_0_0_1px_rgba(168,85,247,0.10),0_0_30px_rgba(168,85,247,0.10),0_0_50px_rgba(34,211,238,0.06)]';
}

function getDiscoveryStoryLine(item: DiscoveryRow) {
    if (item.rank_reason === 'search_pioneer') {
        return '✨ No Coincarnation activity yet — this search could become its first signal.';
    }
    if (item.heat_level === 'HOT') {
        return `🔥 Exploding now — ${formatNumberCompact(item.recent_10m_count)} hits in 10m`;
    }

    if (item.heat_level === 'TRENDING') {
        return `📈 Building momentum — ${formatNumberCompact(item.total_coincarnations)} Coincarnations`;
    }

    if (item.heat_level === 'LIVE') {
        return `⚡ Live in the last 24h — ${formatNumberCompact(item.recent_24h_count)} activity`;
    }

    if (item.rank_reason === 'highest_revived_usd') {
        return `💰 Highest value revival right now — ${formatUsdCompact(item.total_revived_usd)}`;
    }

    if (item.rank_reason === 'most_wallets') {
        return `👥 Strong wallet participation — ${formatNumberCompact(item.unique_wallets)} wallets`;
    }

    if (item.rank_reason === 'most_coincarnations') {
        return `🔁 Most Coincarnations in view — ${formatNumberCompact(item.total_coincarnations)}`;
    }

    return `🧭 Active cluster since ${formatDiscoverySince(item.first_seen_at) || 'unknown'}`;
}

function getDiscoverySortLabel(sort: DiscoverySort) {
    if (sort === 'usd') return 'Clusters ranked by revived value — where capital is flowing';
    if (sort === 'wallets') return 'Clusters ranked by participation — where people are gathering';
    if (sort === 'coincarnations') return 'Clusters ranked by activity — where Coincarnation is happening most';
    return 'Clusters ranked by recent momentum — where activity is emerging';
}

function getRankReasonLabel(reason: DiscoveryRow['rank_reason']) {
    if (reason === 'highest_revived_usd') return 'Top by revived USD';
    if (reason === 'most_wallets') return 'Top by wallet participation';
    if (reason === 'most_coincarnations') return 'Top by Coincarnation count';
    if (reason === 'hot_now') return 'Hot right now';
    if (reason === 'trending_now') return 'Trending now';
    if (reason === 'live_now') return 'Live in the last 24h';
    if (reason === 'search_pioneer') return 'Be the first';
    return 'Recent cluster';
}

function formatDiscoverySince(value: string | null) {
    if (!value) return null;

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    return d.toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function normalizeSearchText(value: string) {
    return value.trim().toLowerCase();
}

function isExactDiscoveryMatch(item: DiscoveryRow, query: string) {
    const q = normalizeSearchText(query);
    if (!q) return false;

    return (
        normalizeSearchText(item.symbol || '') === q ||
        normalizeSearchText(item.name || '') === q ||
        normalizeSearchText(item.mint) === q
    );
}

function getDiscoverySearchContext(items: DiscoveryRow[], query: string) {
    const q = query.trim();
    if (!q) return null;

    const exactItem = items.find((item) => isExactDiscoveryMatch(item, q));
    if (exactItem) {
        if (exactItem.rank_reason === 'search_pioneer') {
            return {
                tone: 'pioneer' as const,
                title: 'Exact match found — no activity yet',
                body: `${exactItem.symbol || exactItem.name || 'This token'} was found, but it has not entered an active Coincarnation cluster yet.`,
            };
        }

        return {
            tone: 'exact' as const,
            title: 'Exact match surfaced',
            body: `${exactItem.symbol || exactItem.name || 'This token'} is currently visible in discovery results.`,
        };
    }

    if (items.length > 0) {
        const hasPioneer = items.some((item) => item.rank_reason === 'search_pioneer');

        if (hasPioneer) {
            return {
                tone: 'pioneer' as const,
                title: 'Found, but not in active clusters',
                body: 'A matching token was found, but it has no Coincarnation activity yet. This could be an early entry point.',
            };
        }

        return {
            tone: 'related' as const,
            title: 'Related clusters surfaced',
            body: 'No exact match was found, but nearby discovery results matched your search.',
        };
    }

    return {
        tone: 'empty' as const,
        title: 'No discovery match found',
        body: 'Try a symbol, full token name, or the mint address to surface a better match.',
    };
}

function getDiscoverySearchContextClass(
    tone: 'exact' | 'related' | 'pioneer' | 'empty'
) {
    if (tone === 'exact') {
        return 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100';
    }

    if (tone === 'related') {
        return 'border-white/10 bg-white/[0.04] text-gray-200';
    }

    if (tone === 'pioneer') {
        return 'border-violet-400/25 bg-violet-400/10 text-violet-100';
    }

    return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
}

function getMobileActionButtonClass(status: TokenStatus, disabled: boolean) {
    const base =
        'h-8 w-8 rounded-xl border text-[13px] font-semibold ' +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_16px_rgba(0,0,0,0.14)] ' +
        'backdrop-blur-sm transition-all duration-200 flex items-center justify-center ' +
        'hover:scale-105 active:scale-95';

    if (disabled) {
        return `${base} border-white/10 bg-white/[0.03] text-gray-500 opacity-45 cursor-not-allowed`;
    }

    if (status === 'healthy') {
        return `${base} border-emerald-400/25 bg-emerald-500/12 text-emerald-200 hover:shadow-[0_0_18px_rgba(16,185,129,0.35)]`;
    }

    if (status === 'walking_dead') {
        return `${base} border-amber-400/25 bg-amber-500/12 text-amber-200 hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]`;
    }

    if (status === 'deadcoin') {
        return `${base} border-zinc-300/15 bg-zinc-500/10 text-zinc-100 hover:shadow-[0_0_18px_rgba(113,113,122,0.35)]`;
    }

    return `${base} border-cyan-400/20 bg-cyan-500/10 text-cyan-200`;
}

function scrollToRegistry() {
    const el = document.getElementById('token-registry');
    if (!el) return;

    el.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
    });

    setTimeout(() => {
        history.replaceState(null, '', '/coinographia');
    }, 400);
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
    const [copiedMint, setCopiedMint] = useState<string | null>(null);
    const [toast, setToast] = useState<{ text: string } | null>(null);

    const [q, setQ] = useState('');
    const [status, setStatus] = useState<TokenStatus | ''>('');
    const [limit, setLimit] = useState(20);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [metricCards, setMetricCards] = useState<MetricCard[]>([]);
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

    const discoverySearchContext = useMemo(() => {
        return getDiscoverySearchContext(discoveryItems, q);
    }, [discoveryItems, q]);

    const hasActiveSearch = q.trim().length > 0;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    async function handleMintCopy(mint: string) {
        const ok = await copyToClipboard(mint);
        if (!ok) return;

        setCopiedMint(mint);
        setToast({ text: 'Mint copied' });

        window.setTimeout(() => setCopiedMint(null), 1200);
        window.setTimeout(() => setToast(null), 1400);
    }

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
                        <div className="flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1.25fr)_minmax(520px,560px)] xl:gap-7 xl:items-stretch">
                            <div className="flex min-w-0 flex-col xl:h-full">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                                        Coinographia
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-300">
                                        Live Classification Layer
                                    </span>
                                </div>

                                <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl xl:text-[42px] xl:leading-[1.05]">
                                    The market is fragmented. Not all tokens survive.
                                </h1>

                                <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 sm:text-[15px]">
                                    Crypto is no longer a uniform space. Some tokens remain strong, others decay,
                                    and many are already abandoned. Coinographia reveals this reality in real time —
                                    separating healthy assets from walking deadcoins and deadcoins.

                                    <span className="block mt-3 text-white font-medium">
                                        When the system breaks, Coincarnation becomes necessary.
                                    </span>
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

                                <div className="mt-8 xl:mt-10">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                        <p className="text-xs leading-6 text-gray-400 sm:text-sm">
                                            Strong tokens remain above higher survival thresholds. Walking Deadcoins fall into the danger zone without fully disappearing. Deadcoins drop below minimum survivability. Redlist and Blacklist directly override Coincarnation access.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="min-w-0 xl:h-full xl:flex xl:flex-col">
                                {metricsError && (
                                    <div className="mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                                        Threshold metrics could not be loaded right now.
                                    </div>
                                )}

                                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex-1">
                                    <div className="group flex h-full min-h-[172px] xl:min-h-[176px] flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                                Healthy Min Volume
                                            </div>
                                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
                                        </div>

                                        <div className="mt-6 text-2xl font-bold text-white">
                                            {formatMetricValue(getMetricCardValue(metricCards, 'healthy_min_vol_usd'), 'usd')}
                                        </div>

                                        <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                            Minimum volume expected for healthy survival.
                                        </p>
                                    </div>

                                    <div className="group flex h-full min-h-[172px] xl:min-h-[176px] flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(34,211,238,0.08)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                                Healthy Min Liquidity
                                            </div>
                                            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
                                        </div>

                                        <div className="mt-6 text-2xl font-bold text-white">
                                            {formatMetricValue(getMetricCardValue(metricCards, 'healthy_min_liq_usd'), 'usd')}
                                        </div>

                                        <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                            Liquidity threshold required to remain strong.
                                        </p>
                                    </div>

                                    <div className="group flex h-full min-h-[172px] xl:min-h-[176px] flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(245,158,11,0.08)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                                Walking Dead Min Volume
                                            </div>
                                            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.9)]" />
                                        </div>

                                        <div className="mt-6 text-2xl font-bold text-white">
                                            {formatMetricValue(getMetricCardValue(metricCards, 'walking_dead_min_vol_usd'), 'usd')}
                                        </div>

                                        <p className="mt-auto pt-2 text-xs leading-5 text-gray-400">
                                            Minimum activity needed to avoid the deadcoin zone.
                                        </p>
                                    </div>

                                    <div className="group flex h-full min-h-[172px] xl:min-h-[176px] flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(244,63,94,0.08)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                                Walking Dead Min Liquidity
                                            </div>
                                            <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.9)]" />
                                        </div>

                                        <div className="mt-6 text-2xl font-bold text-white">
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
                </div>

                <div className="mb-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="min-w-0 flex-1 pt-0.5">
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
                                    placeholder="Search a token… find clusters or become the first"
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

                    {hasActiveSearch && discoverySearchContext && (
                        <div
                            className={[
                                'mt-3 rounded-2xl border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
                                getDiscoverySearchContextClass(discoverySearchContext.tone),
                            ].join(' ')}
                        >
                            <div className="font-semibold">
                                {discoverySearchContext.title}
                            </div>

                            <div className="mt-1 text-sm leading-6 text-current opacity-80">
                                {discoverySearchContext.body}
                            </div>
                        </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-sm text-gray-300">
                            Looking for a specific token status?
                            <span className="ml-1 text-gray-400">Jump straight to the full registry.</span>
                        </div>

                        <button
                            type="button"
                            onClick={scrollToRegistry}
                            className="inline-flex items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition-all duration-200 hover:bg-cyan-400/15 hover:border-cyan-400/30 hover:-translate-y-[1px]"
                        >
                            Jump to Token Registry
                        </button>
                    </div>
                </div>

                <div className="relative mb-8 overflow-hidden rounded-[26px] border border-cyan-400/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.10),transparent_28%),linear-gradient(180deg,rgba(9,14,26,0.98),rgba(12,18,32,0.95))] p-5 shadow-[0_22px_70px_rgba(2,6,23,0.36)]">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-cyan-400/8 blur-3xl" />
                        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-violet-400/8 blur-3xl" />
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
                    </div>
                    <div className="relative z-[1] flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex max-w-3xl flex-col xl:min-h-[100%] xl:justify-between">
                            <h2 className="text-lg font-semibold text-white">Live Discovery</h2>
                            <p className="mt-2 text-sm text-gray-300">
                                This is where Coincarnation activity concentrates.
                                Discover which tokens are gaining traction, attracting wallets,
                                and generating revival momentum in real time.
                            </p>
                            <p className="mt-3 text-xs leading-5 text-slate-300/70">
                                {getDiscoverySortLabel(discoverySort)}
                                {status ? ` · Filtered by ${status}` : ''}
                                {q.trim() ? ` · Search: "${q.trim()}"` : ''}
                            </p>
                        </div>

                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
                            <select
                                value={discoverySort}
                                onChange={(e) => setDiscoverySort(e.target.value as DiscoverySort)}
                                className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
                            >
                                <option value="recent">Most recent</option>
                                <option value="usd">Most revived USD</option>
                                <option value="wallets">Most wallets</option>
                                <option value="coincarnations">Most Coincarnations</option>
                            </select>

                            <button
                                onClick={() => void loadDiscovery()}
                                className="flex-1 min-w-0 truncate whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                                title="Refresh Discovery"
                            >
                                Refresh
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
                                    className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,27,45,0.78),rgba(11,16,28,0.90))] p-4 animate-pulse"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-11 w-11 rounded-full bg-white/10" />
                                        <div className="min-w-0 flex-1 pt-0.5">
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
                            discoveryItems.map((it, index) => {
                                const isDisabled = it.status === 'redlist' || it.status === 'blacklist';
                                const isFeatured = index === 0;
                                const isPioneer = it.rank_reason === 'search_pioneer';

                                const isCoinc = discoverySort === 'coincarnations' || discoverySort === 'recent';
                                const isUsd = discoverySort === 'usd';
                                const isWallets = discoverySort === 'wallets';

                                return (
                                    <div
                                        key={it.mint}
                                        onClick={() => handleCoincarnateClick(it.mint, it.status)}
                                        className={[
                                            getDiscoveryCardClass(it.heat_level, it.status),
                                            isFeatured
                                                ? 'ring-1 ring-cyan-400/35 shadow-[0_0_34px_rgba(34,211,238,0.16)] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_24%),linear-gradient(180deg,rgba(22,30,48,0.96),rgba(13,18,31,0.96))] md:scale-[1.01]'
                                                : '',
                                            isPioneer ? getPioneerCardAccentClass() : '',
                                        ].join(' ')}
                                    >
                                        {isFeatured && (
                                            <div className="relative z-[1] mb-3 flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/14 px-2.5 py-1 text-[10px] font-semibold tracking-[0.05em] text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.14)]">
                                                    Featured Cluster
                                                </span>

                                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-gray-300">
                                                    Ranked by {discoverySort}
                                                </span>
                                            </div>
                                        )}

                                        {isPioneer && (
                                            <div className="pointer-events-none absolute inset-0 rounded-2xl">
                                                <div className="absolute -left-10 top-10 h-24 w-24 rounded-full bg-violet-400/10 blur-3xl animate-pulse" />
                                                <div className="absolute right-0 top-1/2 h-20 w-20 rounded-full bg-cyan-400/10 blur-3xl animate-pulse" />
                                            </div>
                                        )}

                                        <div className="relative z-[1] flex items-start gap-2.5 sm:gap-3">
                                            {it.logo_uri ? (
                                                <img
                                                    src={it.logo_uri}
                                                    alt={it.symbol || it.name || it.mint}
                                                    className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/10 object-cover shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_20px_rgba(255,255,255,0.06)] group-hover:scale-[1.03] transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/10 bg-white/5 shrink-0 shadow-[0_0_18px_rgba(255,255,255,0.03)]" />
                                            )}

                                            <div className="min-w-0 flex-1 pt-0.5">
                                                <div className="truncate text-[14px] sm:text-[15px] font-semibold leading-[1.2] text-white transition-all duration-200 group-hover:text-cyan-50 group-hover:tracking-[0.01em]">
                                                    {it.symbol || 'Unknown Symbol'}
                                                    {it.name ? ` — ${it.name}` : ''}
                                                </div>

                                                <div
                                                    className="mt-0.5 truncate font-mono text-[10px] sm:text-[11px] text-gray-500 transition-colors duration-200 group-hover:text-gray-300"
                                                    title={it.mint}
                                                >
                                                    {shortenMint(it.mint)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative z-[1] mt-3">
                                            <div className="relative z-[1] flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                                <StatusBadge status={it.status} />
                                                <HeatBadge heat={it.heat_level} />

                                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2 py-[5px] text-[10px] sm:text-[11px] font-medium text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                                    {getRankReasonLabel(it.rank_reason)}
                                                </span>

                                                {!isPioneer && (
                                                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-[5px] text-[10px] sm:text-[11px] text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                                        Score {formatNumberCompact(it.activity_score)}
                                                    </span>
                                                )}
                                            </div>

                                            <div
                                                className={[
                                                    'relative z-[1] mt-2.5 rounded-xl border px-3 py-2 text-[11px] sm:text-[12px] leading-5 text-gray-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 group-hover:-translate-y-[1px]',
                                                    isPioneer
                                                        ? 'border-violet-400/20 bg-[linear-gradient(180deg,rgba(168,85,247,0.10),rgba(255,255,255,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_24px_rgba(168,85,247,0.08)]'
                                                        : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.025))]',
                                                ].join(' ')}
                                            >
                                                {getDiscoveryStoryLine(it)}
                                            </div>

                                            {isPioneer ? (
                                                <div className="relative z-[1] mt-3 rounded-xl border border-dashed border-violet-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(168,85,247,0.03))] px-3 py-2.5 text-center text-[12px] font-medium text-gray-300 shadow-[0_0_20px_rgba(168,85,247,0.06)]">
                                                    No activity yet
                                                </div>
                                            ) : (
                                                <div className="relative z-[1] mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
                                                    <div
                                                        className={[
                                                            'rounded-xl border px-2.5 py-2 sm:px-3 transition-all duration-200 group-hover:-translate-y-[2px] group-hover:shadow-[0_10px_24px_rgba(0,0,0,0.16)]',
                                                            isCoinc
                                                                ? 'border-cyan-400/35 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.14)]'
                                                                : 'border-white/10 bg-white/[0.03]',
                                                        ].join(' ')}
                                                    >
                                                        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.08em] text-gray-500 group-hover:text-gray-400 transition-colors duration-200">
                                                            Coinc.
                                                        </div>
                                                        <div className="mt-1 text-[13px] sm:text-sm font-semibold text-white leading-none">
                                                            {formatNumberCompact(it.total_coincarnations)}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={[
                                                            'rounded-xl border px-2.5 py-2 sm:px-3 transition-all duration-200 group-hover:-translate-y-[2px] group-hover:shadow-[0_10px_24px_rgba(0,0,0,0.16)]',
                                                            isUsd
                                                                ? 'border-emerald-400/35 bg-emerald-400/10 shadow-[0_0_20px_rgba(16,185,129,0.14)]'
                                                                : 'border-white/10 bg-white/[0.03]',
                                                        ].join(' ')}
                                                    >
                                                        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.08em] text-gray-500 group-hover:text-gray-400 transition-colors duration-200">
                                                            Revived
                                                        </div>
                                                        <div className="mt-1 text-[13px] sm:text-sm font-semibold text-white leading-none">
                                                            {formatUsdCompact(it.total_revived_usd)}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={[
                                                            'rounded-xl border px-2.5 py-2 sm:px-3 transition-all duration-200 group-hover:-translate-y-[2px] group-hover:shadow-[0_10px_24px_rgba(0,0,0,0.16)]',
                                                            isWallets
                                                                ? 'border-amber-400/35 bg-amber-400/10 shadow-[0_0_20px_rgba(245,158,11,0.14)]'
                                                                : 'border-white/10 bg-white/[0.03]',
                                                        ].join(' ')}
                                                    >
                                                        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.08em] text-gray-500 group-hover:text-gray-400 transition-colors duration-200">
                                                            Wallets
                                                        </div>
                                                        <div className="mt-1 text-[13px] sm:text-sm font-semibold text-white leading-none">
                                                            {formatNumberCompact(it.unique_wallets)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {!isPioneer && (
                                                <div className="relative z-[1] mt-3 border-t border-white/6 pt-2.5 text-[10px] sm:text-[11px] text-gray-400">
                                                    <div className="truncate text-left">
                                                        Last activity:{' '}
                                                        <span className="text-gray-200">
                                                            {it.last_activity_at ? formatUpdatedShort(it.last_activity_at) : 'No activity yet'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            <button
                                                disabled={isDisabled}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCoincarnateClick(it.mint, it.status);
                                                }}
                                                className={[
                                                    'relative z-[1] mt-3 w-full rounded-xl px-3 py-2.5 text-[12px] sm:text-[13px] font-semibold tracking-[0.01em] transition-all duration-200 hover:scale-[1.01] hover:-translate-y-[1px] active:scale-[0.99]',
                                                    getCoincarnateButtonClass(it.status, isDisabled),
                                                    isPioneer ? 'shadow-[0_0_24px_rgba(168,85,247,0.10)] hover:shadow-[0_0_32px_rgba(168,85,247,0.16)]' : '',
                                                ].join(' ')}
                                                title={
                                                    isDisabled
                                                        ? 'Coincarnation is disabled for redlisted or blacklisted tokens.'
                                                        : `Coincarnate ${it.symbol ? `$${it.symbol}` : 'this token'}`
                                                }
                                            >
                                                {isDisabled
                                                    ? 'Coincarnation Disabled'
                                                    : it.rank_reason === 'search_pioneer'
                                                        ? it.symbol
                                                            ? `Start the First Coincarnation for $${it.symbol}`
                                                            : 'Start the First Coincarnation'
                                                        : it.symbol
                                                            ? `Coincarnate $${it.symbol}`
                                                            : 'Coincarnate'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-400">
                                <div className="font-medium text-gray-200">
                                    {q.trim()
                                        ? 'No active discovery clusters matched your search.'
                                        : 'No active clusters found right now — this might be your moment to start one.'}
                                </div>

                                <div className="mt-2 leading-6 text-gray-400">
                                    {q.trim()
                                        ? 'Try searching by symbol, full token name, or mint address.'
                                        : 'Once Coincarnation activity starts, clusters will surface here automatically.'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div id="token-registry" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-400 scroll-mt-24">
                    <div>
                        <div className="text-sm font-semibold text-white">Token Registry</div>
                        <div className="mt-1 text-xs text-gray-400">
                            {loading ? 'Loading registry…' : `${total} token(s) found`}
                        </div>
                    </div>

                    <button
                        onClick={() => void load()}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                    >
                        Refresh Registry
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
                        <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.028))] p-4 text-gray-400 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
                            No registry records matched your current filters.
                        </div>
                    )}

                    {items.map((it) => {
                        const isDisabled = it.status === 'redlist' || it.status === 'blacklist';

                        return (
                            <div
                                key={it.mint}
                                className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.028))] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
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
                                                    onClick={() => void handleMintCopy(it.mint)}
                                                    className={[
                                                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]',
                                                        copiedMint === it.mint
                                                            ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                                                            : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08] hover:text-white',
                                                    ].join(' ')}
                                                    title={copiedMint === it.mint ? 'Copied' : 'Copy mint'}
                                                    aria-label={copiedMint === it.mint ? 'Copied' : 'Copy mint'}
                                                >
                                                    {copiedMint === it.mint ? 'copied' : 'copy'}
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
                                        <span className="leading-none text-[14px]">↗</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
                    <table className="min-w-full table-fixed text-sm">
                        <thead className="bg-white/[0.06] backdrop-blur-sm">
                            <tr>
                                <th className="w-[40%] p-3 text-left text-sm">Token</th>
                                <th className="w-[14%] p-3 text-center text-sm">Status</th>
                                <th className="w-[18%] p-3 text-center text-sm">Details</th>
                                <th className="w-[28%] p-3 text-center text-sm">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-gray-400">
                                        No registry records matched your current filters.
                                    </td>
                                </tr>
                            )}

                            {items.map((it) => {
                                const isDisabled = it.status === 'redlist' || it.status === 'blacklist';
                                const tokenLabel = it.symbol ? `$${it.symbol}` : 'this token';

                                return (
                                    <tr
                                        key={it.mint}
                                        className="border-b border-white/10 transition-colors duration-150 hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                                    >
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
                                                            onClick={() => void handleMintCopy(it.mint)}
                                                            className={[
                                                                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]',
                                                                copiedMint === it.mint
                                                                    ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                                                                    : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08] hover:text-white',
                                                            ].join(' ')}
                                                            title={copiedMint === it.mint ? 'Copied' : 'Copy mint'}
                                                            aria-label={copiedMint === it.mint ? 'Copied' : 'Copy mint'}
                                                        >
                                                            {copiedMint === it.mint ? 'copied' : 'copy'}
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-sm text-gray-400">
                        Page {page + 1} / {totalPages}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                        >
                            Previous
                        </button>

                        <button
                            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                            disabled={page + 1 >= totalPages}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
            {toast && (
                <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
                    <div className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-4 py-2 text-sm text-emerald-200 shadow-[0_10px_30px_rgba(16,185,129,0.18)] backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {toast.text}
                    </div>
                </div>
            )}
        </div>
    );
}