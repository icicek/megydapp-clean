// app/api/coinographia/assets/[mint]/profile/route.ts

import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOLANA_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type TokenStatus =
    | 'healthy'
    | 'walking_dead'
    | 'deadcoin'
    | 'redlist'
    | 'blacklist';

type RouteContext = {
    params: Promise<{
        mint: string;
    }>;
};

export async function GET(
    _req: NextRequest,
    context: RouteContext
) {
    try {
        const { mint: rawMint } = await context.params;
        const mint = decodeURIComponent(rawMint || '').trim();

        if (!mint || !SOLANA_MINT_PATTERN.test(mint)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'A valid Solana mint address is required.',
                },
                {
                    status: 400,
                    headers: {
                        'Cache-Control': 'no-store',
                    },
                }
            );
        }

        const [
            currentStatusRows,
            survivalHistoryRows,
            coincarnationEventRows,
            totalRows,
        ] = await Promise.all([
            sql`
                SELECT
                    r.mint,
                    r.status::text AS status,
                    r.reason,
                    r.updated_by,
                    r.status_at,
                    r.updated_at,
                    r.meta
                FROM token_registry r
                WHERE r.mint = ${mint}
                LIMIT 1
            `,

            sql`
                SELECT
                    h.mint,
                    h.old_status::text AS old_status,
                    h.new_status::text AS new_status,
                    h.reason,
                    h.source::text AS source,
                    h.changed_at,
                    h.meta
                FROM token_status_history h
                WHERE h.mint = ${mint}
                  AND h.old_status IS DISTINCT FROM h.new_status
                ORDER BY h.changed_at DESC
                LIMIT 100
            `,

            sql`
                SELECT
                    c.id,
                    c.wallet_address,
                    c.token_symbol,
                    c.token_contract,
                    c.token_amount::float8 AS token_amount,
                    c.usd_value::float8 AS usd_value,
                    COALESCE(
                        c.transaction_signature,
                        c.tx_hash
                    ) AS transaction_signature,
                    c.timestamp,
                    c.phase_id,
                    c.alloc_status
                FROM contributions c
                WHERE c.network = 'solana'
                  AND c.token_contract = ${mint}
                  AND NOT EXISTS (
                      SELECT 1
                      FROM contribution_invalidations ci
                      WHERE ci.contribution_id = c.id
                  )
                ORDER BY
                    c.timestamp DESC NULLS LAST,
                    c.id DESC
                LIMIT 50
            `,

            sql`
                SELECT
                    COUNT(*)::int AS total_coincarnations,
                    COUNT(DISTINCT c.wallet_address)::int AS unique_wallets,
                    COALESCE(
                        SUM(c.usd_value),
                        0
                    )::float8 AS total_revived_usd,
                    MIN(c.timestamp) AS first_coincarnation_at,
                    MAX(c.timestamp) AS last_coincarnation_at
                FROM contributions c
                WHERE c.network = 'solana'
                  AND c.token_contract = ${mint}
                  AND NOT EXISTS (
                      SELECT 1
                      FROM contribution_invalidations ci
                      WHERE ci.contribution_id = c.id
                  )
            `,
        ]);

        const currentStatus = currentStatusRows[0] ?? null;
        const totals = totalRows[0] ?? {
            total_coincarnations: 0,
            unique_wallets: 0,
            total_revived_usd: 0,
            first_coincarnation_at: null,
            last_coincarnation_at: null,
        };

        return NextResponse.json(
            {
                success: true,
                mint,

                current_status: currentStatus
                    ? {
                        mint: String(currentStatus.mint),
                        status: String(
                            currentStatus.status
                        ) as TokenStatus,
                        reason: currentStatus.reason
                            ? String(currentStatus.reason)
                            : null,
                        updated_by: currentStatus.updated_by
                            ? String(currentStatus.updated_by)
                            : null,
                        status_at: currentStatus.status_at ?? null,
                        updated_at: currentStatus.updated_at ?? null,
                        meta:
                            currentStatus.meta &&
                                typeof currentStatus.meta === 'object'
                                ? currentStatus.meta
                                : {},
                    }
                    : null,

                survival_history: survivalHistoryRows.map((row) => ({
                    mint: String(row.mint),
                    old_status: row.old_status
                        ? (String(row.old_status) as TokenStatus)
                        : null,
                    new_status: String(
                        row.new_status
                    ) as TokenStatus,
                    reason: row.reason ? String(row.reason) : null,
                    source: row.source ? String(row.source) : null,
                    changed_at: row.changed_at,
                    meta:
                        row.meta && typeof row.meta === 'object'
                            ? row.meta
                            : {},
                })),

                coincarnation_events: coincarnationEventRows.map(
                    (row) => ({
                        id: Number(row.id),
                        wallet_address: String(row.wallet_address),
                        token_symbol: row.token_symbol
                            ? String(row.token_symbol)
                            : null,
                        token_contract: String(row.token_contract),
                        token_amount:
                            row.token_amount === null
                                ? null
                                : Number(row.token_amount),
                        usd_value:
                            row.usd_value === null
                                ? null
                                : Number(row.usd_value),
                        transaction_signature:
                            row.transaction_signature
                                ? String(row.transaction_signature)
                                : null,
                        timestamp: row.timestamp ?? null,
                        phase_id:
                            row.phase_id === null
                                ? null
                                : Number(row.phase_id),
                        alloc_status: row.alloc_status
                            ? String(row.alloc_status)
                            : null,
                    })
                ),

                totals: {
                    total_coincarnations: Number(
                        totals.total_coincarnations ?? 0
                    ),
                    unique_wallets: Number(
                        totals.unique_wallets ?? 0
                    ),
                    total_revived_usd: Number(
                        totals.total_revived_usd ?? 0
                    ),
                    first_coincarnation_at:
                        totals.first_coincarnation_at ?? null,
                    last_coincarnation_at:
                        totals.last_coincarnation_at ?? null,
                },

                generated_at: new Date().toISOString(),
            },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (error: unknown) {
        const { status, body } = httpErrorFrom(error, 500);

        return NextResponse.json(body, {
            status,
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    }
}