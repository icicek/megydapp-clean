// types/coinographia.ts

export type AssetStatus =
    | 'healthy'
    | 'walking_dead'
    | 'deadcoin'
    | 'redlist'
    | 'blacklist';

export type AssetCurrentStatus = {
    mint: string;
    status: AssetStatus;
    reason: string | null;
    updated_by: string | null;
    status_at: string | null;
    updated_at: string | null;
    meta: Record<string, unknown> | null;
};

export type SurvivalHistoryEvent = {
    mint: string;
    old_status: AssetStatus | null;
    new_status: AssetStatus;
    reason: string | null;
    source: string | null;
    changed_at: string;
    meta: Record<string, unknown> | null;
};

export type CoincarnationEvent = {
    id: number;
    wallet_address: string;
    token_symbol: string | null;
    token_contract: string;
    token_amount: number | null;
    usd_value: number | null;
    transaction_signature: string | null;
    timestamp: string | null;
    phase_id: number | null;
    alloc_status: string | null;
};

export type AssetProfileTotals = {
    total_coincarnations: number;
    unique_wallets: number;
    total_revived_usd: number;
    first_coincarnation_at: string | null;
    last_coincarnation_at: string | null;
};

export type AssetProfileResponse = {
    success: boolean;
    mint: string;
    current_status: AssetCurrentStatus | null;
    survival_history: SurvivalHistoryEvent[];
    coincarnation_events: CoincarnationEvent[];
    totals: AssetProfileTotals;
    generated_at: string;
};