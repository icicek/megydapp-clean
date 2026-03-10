// app/api/admin/phases/[id]/snapshot/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { withDebugHeaders } from '@/app/api/_lib/debug';

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = Number(ctx?.params?.id);
    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    // Advisory lock: aynı phase için aynı anda snapshot çalışmasın
    const lockKey = (BigInt(942002) * BigInt(1_000_000_000) + BigInt(Math.trunc(phaseId))).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

    try {
      await sql`BEGIN`;

      // Phase'ı kilitleyerek oku
      const phRows = (await sql/* sql */`
        SELECT
          id,
          phase_no,
          status,
          snapshot_taken_at,
          COALESCE(target_usd,0)::numeric AS target_usd
        FROM phases
        WHERE id = ${phaseId}
        LIMIT 1
        FOR UPDATE
      `) as any[];

      const ph = phRows?.[0];
      if (!ph) {
        await sql`ROLLBACK`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
      }

      if (ph.snapshot_taken_at) {
        await sql`ROLLBACK`;
        return NextResponse.json({ success: false, error: 'PHASE_ALREADY_SNAPSHOTTED' }, { status: 409 });
      }

      // ✅ Only reviewing is snapshotable
      const st = String(ph.status || '');
      if (st !== 'reviewing') {
        await sql`ROLLBACK`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_REVIEWING' }, { status: 409 });
      }

      const phaseNo = Number(ph.phase_no);

      // allocations totals
      const tot = (await sql/* sql */`
        SELECT
          COALESCE(SUM(usd_allocated), 0)::float AS usd_sum,
          COALESCE(SUM(megy_allocated), 0)::float AS megy_sum,
          COUNT(*)::int AS n
        FROM phase_allocations
        WHERE phase_id = ${phaseId}
      `) as any[];

      const usdSum = num(tot?.[0]?.usd_sum, 0);
      const megySum = num(tot?.[0]?.megy_sum, 0);
      const nAlloc = Number(tot?.[0]?.n ?? 0);

      // ✅ Require full if target_usd > 0
      const targetUsd = num(ph.target_usd, 0);
      if (targetUsd > 0 && usdSum + 1e-9 < targetUsd) {
        await sql`ROLLBACK`;
        return NextResponse.json(
          { success: false, error: 'PHASE_NOT_FULL', phaseId, usdSum, targetUsd },
          { status: 409 }
        );
      }

      if (nAlloc <= 0 || megySum <= 0) {
        await sql`ROLLBACK`;
        return NextResponse.json(
          { success: false, error: 'NO_ALLOCATIONS_TO_SNAPSHOT', phaseId, usdSum, megySum, nAlloc },
          { status: 409 }
        );
      }

      // snapshot_taken_at set + phase complete
      const snapRow = (await sql/* sql */`
        UPDATE phases
        SET
          snapshot_taken_at = NOW(),
          status = 'completed',
          closed_at = COALESCE(closed_at, NOW()),
          updated_at = NOW()
        WHERE id = ${phaseId}
          AND snapshot_taken_at IS NULL
        RETURNING snapshot_taken_at
      `) as any[];

      const snapshotAt = snapRow?.[0]?.snapshot_taken_at ?? null;

      // claim_snapshots rebuild
      await sql/* sql */`
        DELETE FROM claim_snapshots
        WHERE phase_id = ${phaseId}
      `;

      await sql/* sql */`
        INSERT INTO claim_snapshots
          (phase_id, wallet_address, megy_amount, claim_status, coincarnator_no, contribution_usd, share_ratio, created_at)
        SELECT
          ${phaseId}::bigint AS phase_id,
          pa.wallet_address::text AS wallet_address,
          SUM(pa.megy_allocated)::numeric AS megy_amount,
          FALSE AS claim_status,
          COALESCE(MAX(p.id), 0)::int AS coincarnator_no,
          SUM(pa.usd_allocated)::numeric AS contribution_usd,
          (SUM(pa.megy_allocated)::float / ${megySum})::numeric AS share_ratio,
          NOW() AS created_at
        FROM phase_allocations pa
          LEFT JOIN participants p
            ON p.wallet_address = pa.wallet_address
           AND COALESCE(p.network, 'solana') = 'solana'
        WHERE pa.phase_id = ${phaseId}
        GROUP BY pa.wallet_address
      `;

      // contributions -> conservative helper status sync
      // IMPORTANT:
      // Snapshot must NOT aggressively rewrite contribution lifecycle
      // when the same contribution spans multiple reviewing/future phases.
      await sql/* sql */`
        WITH impacted AS (
          SELECT DISTINCT pa.contribution_id
          FROM phase_allocations pa
          WHERE pa.phase_id = ${phaseId}
        ),
        alloc_totals AS (
          SELECT
            c.id AS contribution_id,
            COALESCE(c.usd_value,0)::numeric AS usd_value,
            COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS usd_alloc_total
          FROM contributions c
          LEFT JOIN phase_allocations pa
            ON pa.contribution_id = c.id
          WHERE c.id IN (SELECT contribution_id FROM impacted)
          GROUP BY c.id, c.usd_value
        ),
        last_phase AS (
          SELECT DISTINCT ON (pa.contribution_id)
            pa.contribution_id,
            pa.phase_id,
            p.phase_no
          FROM phase_allocations pa
          JOIN phases p ON p.id = pa.phase_id
          WHERE pa.contribution_id IN (SELECT contribution_id FROM impacted)
          ORDER BY pa.contribution_id, p.phase_no DESC, pa.created_at DESC
        ),
        unsnapshotted_alloc AS (
          SELECT DISTINCT pa.contribution_id
          FROM phase_allocations pa
          JOIN phases p ON p.id = pa.phase_id
          WHERE pa.contribution_id IN (SELECT contribution_id FROM impacted)
            AND p.snapshot_taken_at IS NULL
        )
        UPDATE contributions c
        SET
          alloc_status = CASE
            -- still has real remainder -> keep current status (usually partial)
            WHEN at.usd_alloc_total + 1e-9 < at.usd_value
              THEN COALESCE(c.alloc_status, 'partial')

            -- fully allocated, but some future allocations are still unsnapshotted
            WHEN ua.contribution_id IS NOT NULL
              THEN 'allocated'

            -- everything allocated and all related allocations are snapshotted
            ELSE 'snapshotted'
          END,
          phase_id = COALESCE(lp.phase_id, c.phase_id),
          alloc_phase_no = COALESCE(lp.phase_no, c.alloc_phase_no),
          alloc_updated_at = NOW()
        FROM alloc_totals at
        LEFT JOIN last_phase lp
          ON lp.contribution_id = at.contribution_id
        LEFT JOIN unsnapshotted_alloc ua
          ON ua.contribution_id = at.contribution_id
        WHERE c.id = at.contribution_id
      `;

      await sql`COMMIT`;

      return withDebugHeaders(
        NextResponse.json({
          success: true,
          message: '✅ Snapshot complete (claims finalized for this phase).',
          phaseId,
          phaseNo,
          snapshot_taken_at: snapshotAt,
          totals: { usdSum, targetUsd, megySum, allocations: nAlloc },
        }),
        `/api/admin/phases/${phaseId}/snapshot`
      );
    } catch (e) {
      try { await sql`ROLLBACK`; } catch {}
      throw e;
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return withDebugHeaders(
      NextResponse.json(body, { status }),
      `/api/admin/phases/${ctx?.params?.id ?? 'unknown'}/snapshot`
    );
    
  }
}