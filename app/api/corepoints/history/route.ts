// app/api/corepoints/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY_EVENTS = 200;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const wallet =
      url.searchParams.get('wallet') ||
      url.searchParams.get('wallet_address') ||
      '';

    const normalizedWallet = wallet.trim();

    if (!normalizedWallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Identity-aware wallet scope:
    // If the active wallet belongs to a Coincarnation Identity,
    // the Proof Ledger shows CorePoint events from all linked Solana wallets.
    let scopedWallets: string[] = [normalizedWallet];

    try {
      const identityRows = (await sql/*sql*/`
        SELECT identity_id
        FROM identity_wallets
        WHERE chain = 'solana'
          AND LOWER(wallet_address) = LOWER(${normalizedWallet})
        LIMIT 1
      `) as unknown as { identity_id: string | null }[];

      const identityId = identityRows?.[0]?.identity_id ?? null;

      if (identityId) {
        const linkedRows = (await sql/*sql*/`
          SELECT wallet_address
          FROM identity_wallets
          WHERE identity_id = ${identityId}
            AND chain = 'solana'
        `) as unknown as { wallet_address: string }[];

        const linkedWallets = linkedRows
          .map((row) => String(row.wallet_address || '').trim())
          .filter(Boolean);

        if (linkedWallets.length > 0) {
          scopedWallets = Array.from(new Set(linkedWallets));
        }
      }
    } catch (scopeErr: unknown) {
      const message =
        scopeErr instanceof Error ? scopeErr.message : String(scopeErr);

      console.warn(
        '⚠️ /api/corepoints/history identity scope failed, falling back to active wallet:',
        message
      );

      scopedWallets = [normalizedWallet];
    }

    const rows = (await sql/*sql*/`
      WITH recent_events AS MATERIALIZED (
        SELECT
          cpe.id,
          cpe.wallet_address,
          cpe.type,
          cpe.points,
          cpe.value,
          cpe.tx_id,
          cpe.token_contract,
          cpe.ref_wallet,
          cpe.context,
          cpe.day,
          cpe.created_at
        FROM corepoint_events cpe
        WHERE cpe.wallet_address = ANY(${scopedWallets})
        ORDER BY cpe.created_at DESC, cpe.id DESC
        LIMIT ${MAX_HISTORY_EVENTS}
      )
      SELECT
        re.id,
        re.wallet_address,
        re.type,
        re.points,
        re.value,
        re.tx_id,
        re.token_contract,

        COALESCE(
          NULLIF(tmc.symbol, ''),
          NULLIF(contribution_meta.token_symbol, '')
        ) AS token_symbol,

        NULLIF(tmc.name, '') AS token_name,

        re.ref_wallet,
        re.context,
        re.day,
        re.created_at

      FROM recent_events re

      LEFT JOIN token_metadata_cache tmc
        ON tmc.mint = re.token_contract

      LEFT JOIN LATERAL (
        SELECT c.token_symbol
        FROM contributions c
        WHERE c.network = 'solana'
          AND c.token_contract = re.token_contract
          AND c.token_symbol IS NOT NULL
          AND c.token_symbol <> ''
        ORDER BY
          c.timestamp DESC NULLS LAST,
          c.id DESC
        LIMIT 1
      ) contribution_meta
        ON tmc.symbol IS NULL
        OR tmc.symbol = ''

      ORDER BY re.created_at DESC, re.id DESC
    `) as unknown as {
      id: number;
      wallet_address: string;
      type: string;
      points: number | null;
      value: number | null;
      tx_id: string | null;
      token_contract: string | null;
      token_symbol: string | null;
      token_name: string | null;
      ref_wallet: string | null;
      context: string | null;
      day: string | null;
      created_at: string;
    }[];

    const events = rows.map((ev) => ({
      ...ev,
      date: ev.created_at ?? ev.day ?? null,
      scoped_wallets_count: scopedWallets.length,
      is_identity_scoped: scopedWallets.length > 1,
    }));

    return NextResponse.json(
      {
        success: true,
        wallet: normalizedWallet,
        scoped_wallets: scopedWallets,
        scoped_wallets_count: scopedWallets.length,
        is_identity_scoped: scopedWallets.length > 1,
        events,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    console.error('❌ /api/corepoints/history failed:', message);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}