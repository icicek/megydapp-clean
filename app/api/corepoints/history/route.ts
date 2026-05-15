// app/api/corepoints/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const wallet =
      url.searchParams.get('wallet') ||
      url.searchParams.get('wallet_address') ||
      '';

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      );
    }

    // Identity-aware wallet scope:
    // If the active wallet belongs to a Coincarnation Identity,
    // the Proof Ledger shows CorePoint events from all linked Solana wallets.
    let scopedWallets: string[] = [wallet];

    try {
      const identityRows = (await sql/*sql*/`
        SELECT identity_id
        FROM identity_wallets
        WHERE chain = 'solana'
          AND LOWER(wallet_address) = LOWER(${wallet})
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
    } catch (scopeErr: any) {
      console.warn(
        '⚠️ /api/corepoints/history identity scope failed, falling back to active wallet:',
        scopeErr?.message || scopeErr
      );

      scopedWallets = [wallet];
    }

    const rows = (await sql/*sql*/`
      SELECT
        id,
        wallet_address,
        type,
        points,
        value,
        tx_id,
        token_contract,
        ref_wallet,
        context,
        day,
        created_at
      FROM corepoint_events
      WHERE wallet_address = ANY(${scopedWallets})
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as {
      id: number;
      wallet_address: string;
      type: string;
      points: number | null;
      value: number | null;
      tx_id: string | null;
      token_contract: string | null;
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

    return NextResponse.json({
      success: true,
      wallet,
      scoped_wallets: scopedWallets,
      scoped_wallets_count: scopedWallets.length,
      is_identity_scoped: scopedWallets.length > 1,
      events,
    });
  } catch (e: any) {
    console.error('❌ /api/corepoints/history failed:', e?.message || e);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}