// app/api/live-activity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shortenMint(mint: string) {
  if (!mint) return '';
  return `${mint.slice(0, 6)}…${mint.slice(-6)}`;
}

export async function GET(req: NextRequest) {
  try {
    const rawLimit = Number(req.nextUrl.searchParams.get('limit') || 8);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 30))
      : 9;

    const rows = (await sql`
      SELECT
        c.token_symbol,
        c.token_contract,
        COALESCE(tr.status::text, 'unknown') AS status,
        c.wallet_address,
        c.usd_value,
        c.timestamp,
        COALESCE(mc.name, null) AS token_name,
        COALESCE(mc.logo_uri, null) AS logo_uri
      FROM contributions c
      LEFT JOIN token_metadata_cache mc
        ON mc.mint = c.token_contract
      LEFT JOIN token_registry tr
        ON tr.mint = c.token_contract
      WHERE c.network = 'solana'
      ORDER BY c.timestamp DESC
      LIMIT ${limit}
    `) as Array<{
      token_symbol: string | null;
      token_contract: string;
      status: string | null;
      wallet_address: string;
      usd_value: string | number | null;
      timestamp: string;
      token_name: string | null;
      logo_uri: string | null;
    }>;

    const items = rows.map((row) => ({
      tokenSymbol: row.token_symbol || null,
      tokenName: row.token_name || null,
      tokenContract: row.token_contract,
      shortMint: shortenMint(row.token_contract),
      walletAddress: row.wallet_address,
      shortWallet: shortenMint(row.wallet_address),
      usdValue: Number(row.usd_value || 0),
      timestamp: row.timestamp,
      logoURI: row.logo_uri || null,
      status: row.status || null,
    }));

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}