// app/api/admin/phases/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

type AnyRow = Record<string, any>;

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/*
ADMIN PHASE CREATE ROUTE

Purpose:
- create a new planned phase

Business rule:
- a newer phase must NOT have a better (lower) rate than the previous phase
- therefore:
    new rate >= previous phase rate
*/

function asNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const rawScope = req.nextUrl.searchParams.get('is_test');

    if (rawScope !== 'true' && rawScope !== 'false') {
      return NextResponse.json(
        {
          success: false,
          error: 'PHASE_SCOPE_REQUIRED',
          message: 'Query parameter is_test must be true or false.',
        },
        { status: 400 }
      );
    }

    const isTest = rawScope === 'true';

    // 1) All phases in selected admin scope.
    // Unlike the public phase list, completed/snapshotted/finalized
    // phases must remain visible here for review and finalization.
    const rows = (await sql/* sql */`
      WITH phases_sorted AS (
        SELECT
          p.*,
          COALESCE(
            p.target_usd,
            p.usd_cap,
            (
              COALESCE(p.pool_megy, 0)::numeric *
              COALESCE(p.rate_usd_per_megy, 0)::numeric
            ),
            (
              COALESCE(p.megy_pool, 0)::numeric *
              COALESCE(p.rate, 0)::numeric
            ),
            0
          )::numeric AS target_usd_num
        FROM phases p
        WHERE p.is_test = ${isTest}
      ),
      phase_alloc_totals AS (
        SELECT
          pa.phase_id,
          COALESCE(
            SUM(COALESCE(pa.usd_allocated, 0)::numeric),
            0
          )::numeric AS used_usd,
          COUNT(*)::int AS alloc_rows,
          COUNT(DISTINCT pa.wallet_address)::int AS alloc_wallets
        FROM phase_allocations pa
        JOIN phases p
          ON p.id = pa.phase_id
        WHERE p.is_test = ${isTest}
        GROUP BY pa.phase_id
      )
      SELECT
        ps.*,
        COALESCE(pat.used_usd, 0)::numeric AS used_usd,
        COALESCE(pat.alloc_rows, 0)::int AS alloc_rows,
        COALESCE(pat.alloc_wallets, 0)::int AS alloc_wallets,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (
            COALESCE(pat.used_usd, 0)::numeric /
            COALESCE(ps.target_usd_num, 0)::numeric
          )
          ELSE 0
        END AS fill_pct
      FROM phases_sorted ps
      LEFT JOIN phase_alloc_totals pat
        ON pat.phase_id = ps.id
      ORDER BY ps.phase_no ASC, ps.id ASC
    `) as AnyRow[];

    // 2) Queue for selected scope only.
    const queue = (await sql/* sql */`
      SELECT
        COALESCE(
          SUM(COALESCE(c.usd_value, 0)::numeric),
          0
        )::numeric AS queue_usd
      FROM contributions c
      LEFT JOIN token_registry tr
        ON tr.mint = c.token_contract
      WHERE c.phase_id IS NULL
        AND c.is_test = ${isTest}
        AND COALESCE(c.alloc_status, 'unassigned') = 'unassigned'
        AND COALESCE(c.network, 'solana') = 'solana'
        AND COALESCE(c.usd_value, 0)::numeric > 0
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (
            tr.mint IS NOT NULL
            AND tr.status IN ('healthy', 'walking_dead')
          )
        )
    `) as AnyRow[];

    // 3) Eligible contribution summary for selected scope.
    const debug = (await sql/* sql */`
      SELECT
        COUNT(*)::int AS eligible_rows,
        COALESCE(
          SUM(COALESCE(c.usd_value, 0)::numeric),
          0
        )::numeric AS eligible_usd_sum,
        MIN(c.timestamp) AS first_ts,
        MAX(c.timestamp) AS last_ts
      FROM contributions c
      LEFT JOIN token_registry tr
        ON tr.mint = c.token_contract
      WHERE COALESCE(c.network, 'solana') = 'solana'
        AND c.is_test = ${isTest}
        AND COALESCE(c.usd_value, 0)::numeric > 0
        AND COALESCE(c.alloc_status, 'unassigned') <> 'snapshotted'
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (
            tr.mint IS NOT NULL
            AND tr.status IN ('healthy', 'walking_dead')
          )
        )
    `) as AnyRow[];

    // 4) Authoritative active phase for selected scope.
    const activeNow = (await sql/* sql */`
      SELECT
        id,
        phase_no
      FROM phases
      WHERE status = 'active'
        AND snapshot_taken_at IS NULL
        AND is_test = ${isTest}
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
    `) as AnyRow[];

    const active = activeNow?.[0] ?? null;

    const phases = rows.map((r) => {
      const phaseId = asNum(r.id) ?? 0;

      const rateRaw =
        r.rate_usd_per_megy ??
        r.rate ??
        null;

      const rateNum =
        rateRaw === ''
          ? null
          : asNum(rateRaw);

      return {
        phase_id: phaseId,
        phase_no:
          asNum(r.phase_no) ??
          phaseId,

        name: String(r.name ?? ''),
        status: String(r.status ?? ''),

        pool_megy:
          r.pool_megy ??
          r.megy_pool ??
          null,

        rate_usd_per_megy:
          rateNum,

        target_usd:
          r.target_usd ??
          r.usd_cap ??
          null,

        used_usd:
          r.used_usd ?? 0,

        fill_pct:
          r.fill_pct ?? 0,

        alloc_wallets:
          r.alloc_wallets ?? 0,

        alloc_rows:
          r.alloc_rows ?? 0,

        opened_at:
          r.opened_at ?? null,

        closed_at:
          r.closed_at ?? null,

        snapshot_taken_at:
          r.snapshot_taken_at ?? null,

        finalized_at:
          r.finalized_at ?? null,

        created_at:
          r.created_at ?? null,

        updated_at:
          r.updated_at ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      scope: isTest
        ? 'test'
        : 'production',
      is_test: isTest,

      current_active_phase_id:
        active?.id
          ? Number(active.id)
          : null,

      current_active_phase_no:
        active?.phase_no
          ? Number(active.phase_no)
          : null,

      phases,

      queue:
        queue?.[0] ??
        { queue_usd: 0 },

      debug:
        debug?.[0] ??
        null,
    });
  } catch (err: unknown) {
    const { status, body } =
      httpErrorFrom(err, 500);

    return NextResponse.json(
      body,
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  let lockKey: string | null = null;

  try {
    await requireAdmin(req as any);

    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? '').trim();
    const pool_megy = asNum(body?.pool_megy);
    const rate_usd_per_megy = asNum(body?.rate_usd_per_megy);

    const is_test =
      body?.is_test === false
        ? false
        : true;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'NAME_REQUIRED' },
        { status: 400 }
      );
    }

    if (pool_megy == null || pool_megy <= 0) {
      return NextResponse.json(
        { success: false, error: 'POOL_INVALID' },
        { status: 400 }
      );
    }

    if (rate_usd_per_megy == null || rate_usd_per_megy <= 0) {
      return NextResponse.json(
        { success: false, error: 'RATE_INVALID' },
        { status: 400 }
      );
    }

    // Global advisory lock for phase creation / numbering
    lockKey = (BigInt(942010) * BigInt(1_000_000_000)).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

    await sql`BEGIN`;

    // 1) Find previous phase safely (no aggregate FOR UPDATE)
    const prevRows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(
          rate_usd_per_megy,
          rate,
          0
        )::numeric AS prev_rate
      FROM phases
      WHERE is_test = ${is_test}
      ORDER BY phase_no DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const prev = prevRows?.[0] ?? null;
    const prevRate = prev ? Number(prev.prev_rate ?? 0) : null;
    const nextNo = prev ? Number(prev.phase_no ?? 0) + 1 : 1;

    // 2) Business rule:
    // new phase cannot be more advantageous than previous phase
    // therefore new rate must be >= previous rate
    if (
      prev &&
      Number.isFinite(prevRate) &&
      prevRate != null &&
      prevRate > 0 &&
      rate_usd_per_megy < prevRate
    ) {
      await sql`ROLLBACK`;

      return NextResponse.json(
        {
          success: false,
          error: 'RATE_TOO_GOOD_VS_PREVIOUS',
          message:
            'New phase rate cannot be lower than the previous phase rate.',
          previous: {
            phase_id: Number(prev.id),
            phase_no: Number(prev.phase_no),
            name: String(prev.name || ''),
            rate_usd_per_megy: prevRate,
          },
          incoming: {
            phase_no: nextNo,
            rate_usd_per_megy,
          },
        },
        { status: 409 }
      );
    }

    // 3) Create planned phase
    const rows = (await sql/* sql */`
      INSERT INTO phases (
        phase_no,
        name,
        status,
        pool_megy,
        rate_usd_per_megy,
        is_test,
        created_at,
        updated_at
      )
      VALUES (
        ${nextNo},
        ${name},
        'planned',
        ${pool_megy},
        ${rate_usd_per_megy},
        ${is_test},
        NOW(),
        NOW()
      )
      RETURNING *
    `) as any[];

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      phase: rows?.[0] ?? null,
      scope: is_test
        ? 'test'
        : 'production',
      message: is_test
        ? 'Test phase created successfully.'
        : 'Production phase created successfully.',
    });
  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch { }

    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  } finally {
    if (lockKey) {
      try {
        await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
      } catch { }
    }
  }
}