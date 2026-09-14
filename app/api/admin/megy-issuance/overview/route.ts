// app/api/admin/megy-issuance/overview/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Permanent production MEGY mint.
 *
 * IMPORTANT:
 * - Original SPL Token
 * - Solana Mainnet
 * - 9 decimals
 * - Mint Authority is Ledger cold authority
 * - Backend must never hold the Mint Authority private key
 */
const MEGY_MAINNET_MINT =
    '7nJZvQZjt4XtTdti2mQMxboDvo93h23MUDDDX7EPzWwT';
const MEGY_MINT_AUTHORITY =
    '42MsfyA39M8Dr3JFaf91zjyNg7V4XVUNVPKSbRaL4cfB';

const MEGY_DECIMALS = 9;

const BUCKET_DESTINATIONS = {
    coincarnation: {
        label: 'Coincarnation Rewards',
        destinationWallet:
            '5xsUuakT88bUeU9WBn1iyHwqSKbj5b7m5Fms89gqqD7d',
    },

    partnerships_ecosystem_growth: {
        label: 'Partnerships & Ecosystem Growth',
        destinationWallet:
            '6rUaTU9JhsKrMMnrUfcgEozzMpn6DCzDh4FWYRTWbP9K',
    },

    fair_future_fund_reserve: {
        label: 'Fair Future Fund Reserve',
        destinationWallet:
            '5vHvG6mbabynm21vUUrJQz9DSkBDRWgMha7w7tJ4kufz',
    },

    liquidity: {
        label: 'Liquidity',
        destinationWallet:
            'DvMQnxDYUTn2DjhzK1KXJHfGKcsPRxeYf1fyKDidM9TF',
    },

    team_contributors: {
        label: 'Team & Contributors',
        destinationWallet:
            '4Hysbg28nPdqpeaqjJ6Z9XMSX89f9oJXeWMv8iUuWX9z',
    },
} as const;

type ReadinessRow = {
    issuance_ledger_id: string | number | bigint | null;
    phase_id: string | number | bigint | null;
    phase_no: number | null;
    phase_name: string | null;
    finalized_at: Date | string | null;
    tokenomics_version: string | null;

    coincarnation_authorized_base: unknown;
    partnerships_ecosystem_growth_base: unknown;
    fair_future_fund_reserve_base: unknown;
    liquidity_base: unknown;
    team_contributors_base: unknown;

    ecosystem_authorized_base: unknown;
    total_authorized_base: unknown;

    coincarnation_minted_base: unknown;
    partnerships_minted_base: unknown;
    fff_minted_base: unknown;
    liquidity_minted_base: unknown;
    team_minted_base: unknown;
    total_minted_base: unknown;

    coincarnation_remaining_base: unknown;
    partnerships_remaining_base: unknown;
    fff_remaining_base: unknown;
    liquidity_remaining_base: unknown;
    team_remaining_base: unknown;
    total_remaining_base: unknown;

    issuance_status: string | null;
};

type MintEventRow = {
    id: string | number | bigint;
    issuance_ledger_id: string | number | bigint;
    mint_type: string;
    amount_base: unknown;
    mint_address: string;
    destination_wallet: string;
    tx_signature: string;
    network: string | null;
    created_by: string | null;
    note: string | null;
    created_at: Date | string | null;
};

/**
 * PostgreSQL NUMERIC / BIGINT values must never be converted to JS Number here.
 *
 * MEGY uses 9 decimals and issuance values can become much larger than the
 * integer precision JavaScript Number can safely represent.
 *
 * Always serialize base-unit values as decimal strings.
 */
function asIntegerString(value: unknown): string {
    if (value === null || value === undefined) {
        return '0';
    }

    const s = String(value).trim();

    if (!/^-?\d+$/.test(s)) {
        throw new Error(`Invalid integer database value: ${s}`);
    }

    return s;
}

function asIdString(value: unknown): string {
    if (value === null || value === undefined) {
        throw new Error('Missing database identifier');
    }

    return String(value);
}

function toIso(value: Date | string | null): string | null {
    if (!value) return null;

    const d = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    return d.toISOString();
}

export async function GET(req: NextRequest) {
    try {
        const adminWallet = await requireAdmin(req);

        /**
         * megy_issuance_readiness already guarantees:
         *
         * - p.is_test = false
         * - snapshot_taken_at IS NOT NULL
         * - finalized_at IS NOT NULL
         *
         * Therefore this view is the authoritative read model for
         * production MEGY issuance readiness.
         */
        const readinessRows = (await sql`
      SELECT
        issuance_ledger_id,
        phase_id,
        phase_no,
        phase_name,
        finalized_at,
        tokenomics_version,

        coincarnation_authorized_base,
        partnerships_ecosystem_growth_base,
        fair_future_fund_reserve_base,
        liquidity_base,
        team_contributors_base,

        ecosystem_authorized_base,
        total_authorized_base,

        coincarnation_minted_base,
        partnerships_minted_base,
        fff_minted_base,
        liquidity_minted_base,
        team_minted_base,
        total_minted_base,

        coincarnation_remaining_base,
        partnerships_remaining_base,
        fff_remaining_base,
        liquidity_remaining_base,
        team_remaining_base,
        total_remaining_base,

        issuance_status
      FROM megy_issuance_readiness
      ORDER BY phase_no DESC, issuance_ledger_id DESC
    `) as unknown as ReadinessRow[];

        /**
         * Recent immutable issuance audit records.
         *
         * The table is append-only at DB level and tx_signature is unique.
         * This is informational here; overview never mutates issuance state.
         */
        const eventRows = (await sql`
      SELECT
        id,
        issuance_ledger_id,
        mint_type,
        amount_base,
        mint_address,
        destination_wallet,
        tx_signature,
        network,
        created_by,
        note,
        created_at
      FROM megy_mint_events
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `) as unknown as MintEventRow[];

        const ledgers = readinessRows.map((row) => ({
            issuanceLedgerId: asIdString(row.issuance_ledger_id),
            phaseId: asIdString(row.phase_id),
            phaseNo: row.phase_no,
            phaseName: row.phase_name,
            finalizedAt: toIso(row.finalized_at),
            tokenomicsVersion: row.tokenomics_version,
            issuanceStatus: row.issuance_status,

            buckets: {
                coincarnation: {
                    mintType: 'coincarnation',
                    label: BUCKET_DESTINATIONS.coincarnation.label,
                    destinationWallet:
                        BUCKET_DESTINATIONS.coincarnation.destinationWallet,

                    authorizedBase: asIntegerString(
                        row.coincarnation_authorized_base
                    ),
                    mintedBase: asIntegerString(
                        row.coincarnation_minted_base
                    ),
                    remainingBase: asIntegerString(
                        row.coincarnation_remaining_base
                    ),
                },

                partnershipsEcosystemGrowth: {
                    mintType: 'partnerships_ecosystem_growth',
                    label:
                        BUCKET_DESTINATIONS.partnerships_ecosystem_growth.label,
                    destinationWallet:
                        BUCKET_DESTINATIONS.partnerships_ecosystem_growth
                            .destinationWallet,

                    authorizedBase: asIntegerString(
                        row.partnerships_ecosystem_growth_base
                    ),
                    mintedBase: asIntegerString(
                        row.partnerships_minted_base
                    ),
                    remainingBase: asIntegerString(
                        row.partnerships_remaining_base
                    ),
                },

                fairFutureFundReserve: {
                    mintType: 'fair_future_fund_reserve',
                    label:
                        BUCKET_DESTINATIONS.fair_future_fund_reserve.label,
                    destinationWallet:
                        BUCKET_DESTINATIONS.fair_future_fund_reserve
                            .destinationWallet,

                    authorizedBase: asIntegerString(
                        row.fair_future_fund_reserve_base
                    ),
                    mintedBase: asIntegerString(
                        row.fff_minted_base
                    ),
                    remainingBase: asIntegerString(
                        row.fff_remaining_base
                    ),
                },

                liquidity: {
                    mintType: 'liquidity',
                    label: BUCKET_DESTINATIONS.liquidity.label,
                    destinationWallet:
                        BUCKET_DESTINATIONS.liquidity.destinationWallet,

                    authorizedBase: asIntegerString(
                        row.liquidity_base
                    ),
                    mintedBase: asIntegerString(
                        row.liquidity_minted_base
                    ),
                    remainingBase: asIntegerString(
                        row.liquidity_remaining_base
                    ),
                },

                teamContributors: {
                    mintType: 'team_contributors',
                    label: BUCKET_DESTINATIONS.team_contributors.label,
                    destinationWallet:
                        BUCKET_DESTINATIONS.team_contributors.destinationWallet,

                    authorizedBase: asIntegerString(
                        row.team_contributors_base
                    ),
                    mintedBase: asIntegerString(
                        row.team_minted_base
                    ),
                    remainingBase: asIntegerString(
                        row.team_remaining_base
                    ),
                },
            },

            totals: {
                ecosystemAuthorizedBase: asIntegerString(
                    row.ecosystem_authorized_base
                ),

                authorizedBase: asIntegerString(
                    row.total_authorized_base
                ),

                mintedBase: asIntegerString(
                    row.total_minted_base
                ),

                remainingBase: asIntegerString(
                    row.total_remaining_base
                ),
            },
        }));

        const recentMintEvents = eventRows.map((row) => ({
            id: asIdString(row.id),
            issuanceLedgerId: asIdString(row.issuance_ledger_id),
            mintType: row.mint_type,

            amountBase: asIntegerString(row.amount_base),

            mintAddress: row.mint_address,
            destinationWallet: row.destination_wallet,
            txSignature: row.tx_signature,
            network: row.network,
            createdBy: row.created_by,
            note: row.note,
            createdAt: toIso(row.created_at),
        }));

        return NextResponse.json(
            {
                success: true,

                megy: {
                    network: 'solana-mainnet',
                    program: 'spl-token',
                    mintAddress: MEGY_MAINNET_MINT,
                    decimals: MEGY_DECIMALS,

                    mintAuthority: MEGY_MINT_AUTHORITY,

                    feePayer: {
                        wallet: MEGY_MINT_AUTHORITY,
                        mode: 'mint-authority-ledger',
                    },
                },

                operator: {
                    adminWallet,
                },

                bucketDestinations: {
                    coincarnation: {
                        mintType: 'coincarnation',
                        ...BUCKET_DESTINATIONS.coincarnation,
                    },

                    partnershipsEcosystemGrowth: {
                        mintType: 'partnerships_ecosystem_growth',
                        ...BUCKET_DESTINATIONS.partnerships_ecosystem_growth,
                    },

                    fairFutureFundReserve: {
                        mintType: 'fair_future_fund_reserve',
                        ...BUCKET_DESTINATIONS.fair_future_fund_reserve,
                    },

                    liquidity: {
                        mintType: 'liquidity',
                        ...BUCKET_DESTINATIONS.liquidity,
                    },

                    teamContributors: {
                        mintType: 'team_contributors',
                        ...BUCKET_DESTINATIONS.team_contributors,
                    },
                },

                ledgers,
                recentMintEvents,
            },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (e: unknown) {
        const { status, body } = httpErrorFrom(e, 500);

        return NextResponse.json(body, {
            status,
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    }
}