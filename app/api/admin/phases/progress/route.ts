// app/api/admin/phases/progress/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

async function hasColumn(table: string, col: string): Promise<boolean> {
  const r = (await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = ${table}
      AND column_name = ${col}
    LIMIT 1;
  `) as any[];
  return (r?.length ?? 0) > 0;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    // ---- phase_allocations column picking (safe) ----
    const usdColCandidates = ['usd_sum', 'usd_value', 'usd_amount', 'usd'];
    let usdCol: string | null = null;
    for (const c of usdColCandidates) {
      if (await hasColumn('phase_allocations', c)) {
        usdCol = c;
        break;
      }
    }

    const walletColCandidates = ['wallet_address', 'wallet', 'address'];
    let walletCol: string | null = null;
    for (const c of walletColCandidates) {
      if (await hasColumn('phase_allocations', c)) {
        walletCol = c;
        break;
      }
    }

    // ---- Build alloc query in a safe branched way (no dynamic identifiers) ----
    // If usd column doesn't exist, we still return rows with 0 allocs.
    // used_* comes from contributions anyway.

    const allocSelect =
      usdCol === 'usd_sum'
        ? sql`
            COALESCE(SUM(a.usd_sum), 0) as alloc_usd_sum
          `
        : usdCol === 'usd_value'
          ? sql`
            COALESCE(SUM(a.usd_value), 0) as alloc_usd_sum
          `
          : usdCol === 'usd_amount'
            ? sql`
            COALESCE(SUM(a.usd_amount), 0) as alloc_usd_sum
          `
            : usdCol === 'usd'
              ? sql`
            COALESCE(SUM(a.usd), 0) as alloc_usd_sum
          `
              : sql`
            0::numeric as alloc_usd_sum
          `;

    const allocWalletsSelect =
      walletCol === 'wallet_address'
        ? sql`COALESCE(COUNT(DISTINCT a.wallet_address), 0) as alloc_wallets`
        : walletCol === 'wallet'
          ? sql`COALESCE(COUNT(DISTINCT a.wallet), 0) as alloc_wallets`
          : walletCol === 'address'
            ? sql`COALESCE(COUNT(DISTINCT a.address), 0) as alloc_wallets`
            : sql`0::int as alloc_wallets`;

    const rows = (await sql`
      SELECT
        p.id as phase_id,

        -- snapshot allocations (post-snapshot)
        ${allocSelect},
        ${allocWalletsSelect},

        -- live window (pre-snapshot assignments)
        COALESCE((
          SELECT SUM(COALESCE(c.usd_value, 0))
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as used_usd,

        COALESCE((
          SELECT COUNT(*)
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as used_rows,

        COALESCE((
          SELECT COUNT(DISTINCT c.wallet_address)
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as used_wallets,

        -- forecast (temporary = used)
        COALESCE((
          SELECT SUM(COALESCE(c.usd_value, 0))
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as used_usd_forecast,

        COALESCE((
          SELECT COUNT(*)
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as alloc_rows_forecast,

        COALESCE((
          SELECT COUNT(DISTINCT c.wallet_address)
          FROM contributions c
          WHERE c.phase_id = p.id
            AND COALESCE(c.alloc_status, '') IN ('pending','snapshotted')
        ), 0) as alloc_wallets_forecast,

        -- global queue debug
        COALESCE((
          SELECT SUM(COALESCE(c2.usd_value, 0))
          FROM contributions c2
          WHERE c2.phase_id IS NULL
            AND COALESCE(c2.alloc_status, 'unassigned') = 'unassigned'
        ), 0) as queue_usd

      FROM phases p
      LEFT JOIN phase_allocations a
        ON a.phase_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC;
    `) as any[];

    return NextResponse.json({ success: true, rows });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
