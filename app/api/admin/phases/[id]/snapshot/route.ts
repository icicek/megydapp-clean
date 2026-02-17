// app/api/admin/phases/[id]/snapshot/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { recomputeFromPhaseId } from '@/app/api/_lib/phases/recompute';

async function sweepUnassignedToPhase(phaseId: number) {
  // phase target + remaining capacity
  const ph = (await sql/* sql */`
    SELECT
      id,
      COALESCE(target_usd, 0)::numeric AS target_usd
    FROM phases
    WHERE id = ${phaseId}
    LIMIT 1
    FOR UPDATE
  `) as any[];

  const targetUsd = Number(ph?.[0]?.target_usd ?? 0);

  // used usd already in this phase
  const used = (await sql/* sql */`
    SELECT COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS used_usd
    FROM contributions
    WHERE phase_id = ${phaseId}
  `) as any[];

  const usedUsd = Number(used?.[0]?.used_usd ?? 0);

  // if no target, assign all
  const remaining = targetUsd > 0 ? Math.max(0, targetUsd - usedUsd) : null;

  if (remaining !== null && remaining <= 0) {
    return { moved: 0, reason: 'PHASE_FULL' as const };
  }

  // Move FIFO rows until remaining USD is reached (window sum)
  const moved = (await sql/* sql */`
    WITH queue AS (
      SELECT
        id,
        COALESCE(usd_value, 0)::numeric AS usd_value,
        SUM(COALESCE(usd_value, 0)::numeric) OVER (
          ORDER BY timestamp ASC NULLS LAST, id ASC
        ) AS run
      FROM contributions
      WHERE phase_id IS NULL
        AND COALESCE(alloc_status, 'unassigned') = 'unassigned'
        AND network = 'solana'
    ),
    pick AS (
      SELECT id
      FROM queue
      WHERE ${remaining === null ? sql`TRUE` : sql`run <= ${remaining}`}
    )
    UPDATE contributions c
    SET
      phase_id = ${phaseId},
      alloc_phase_no = (SELECT phase_no FROM phases WHERE id = ${phaseId}),
      alloc_status = 'pending',
      alloc_updated_at = NOW()
    WHERE c.id IN (SELECT id FROM pick)
    RETURNING c.id
  `) as any[];

  return { moved: moved?.length ?? 0, reason: 'OK' as const };
}

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
        SELECT id, phase_no, status, snapshot_taken_at, rate_usd_per_megy
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

      // allow snapshot for active OR reviewing (reviewing is the intended "full but not frozen yet" state)
      const st = String(ph.status || '');
      if (st !== 'active' && st !== 'reviewing') {
        await sql`ROLLBACK`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_SNAPSHOTABLE' }, { status: 409 });
      }

      const phaseNo = Number(ph.phase_no);
      const currentRate = Number(ph.rate_usd_per_megy ?? 0);

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

      if (nAlloc <= 0 || megySum <= 0) {
        await sql`ROLLBACK`;
        return NextResponse.json(
          { success: false, error: 'NO_ALLOCATIONS_TO_SNAPSHOT', phaseId, usdSum, megySum, nAlloc },
          { status: 409 }
        );
      }

      // snapshot_taken_at set + phase complete (timestamps)
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

      // contributions -> snapshotted
      await sql/* sql */`
        UPDATE contributions c
        SET alloc_status = 'snapshotted',
            alloc_updated_at = NOW()
        FROM phase_allocations pa
        WHERE pa.phase_id = ${phaseId}
          AND pa.contribution_id = c.id
      `;

      // ✅ NEXT PHASE: open sequential planned phases (up to N), sweep queue each time.
      // We still only snapshot ACTIVE phase. This is just queue distribution after closing.
      const opened: Array<{ id: number; phaseNo: number }> = [];
      let sweep: any = null;

      let cursorPhaseNo = phaseNo;
      let cursorRate = currentRate;

      for (let i = 0; i < 10; i++) {
        const next = (await sql/* sql */`
          UPDATE phases
          SET
            status = 'active',
            opened_at = COALESCE(opened_at, NOW()),
            updated_at = NOW()
          WHERE id = (
            SELECT id
            FROM phases
            WHERE (status IS NULL OR status='planned')
              AND snapshot_taken_at IS NULL
              AND phase_no > ${cursorPhaseNo}
              AND rate_usd_per_megy >= ${cursorRate}
            ORDER BY phase_no ASC
            LIMIT 1
            FOR UPDATE
          )
          RETURNING id, phase_no, rate_usd_per_megy
        `) as any[];

        const row = next?.[0] || null;
        if (!row?.id) break;

        const rowId = Number(row.id);
        const rowNo = Number(row.phase_no);

        opened.push({ id: rowId, phaseNo: rowNo });

        // Move queued contributions into this newly opened phase
        const sw = await sweepUnassignedToPhase(rowId);
        sweep = sw;

        // advance cursor
        cursorPhaseNo = rowNo;
        cursorRate = Number(row.rate_usd_per_megy ?? cursorRate);

        // If phase is NOT full, queue might be empty or partially moved.
        // Stop here to avoid auto-opening too many phases unnecessarily.
        if (sw?.reason !== 'PHASE_FULL') break;
      }

      await sql`COMMIT`;

      // recompute: only if at least one phase opened
      let recompute: any = null;
      if (opened.length > 0) {
        // recompute from the FIRST newly opened phase (most conservative)
        recompute = await recomputeFromPhaseId(opened[0].id);
      }

      const firstOpened = opened.length > 0 ? opened[0] : null;

      const message = firstOpened
        ? `✅ Snapshot complete → Next opened: #${firstOpened.phaseNo}`
        : `✅ Snapshot complete — No next phase to open.`;

      return NextResponse.json({
        success: true,
        message,
        phaseId,
        phaseNo,
        snapshot_taken_at: snapshotAt,
        totals: { usdSum, megySum, allocations: nAlloc },
        nextOpened: firstOpened,
        nextOpenedAll: opened, // optional but very useful for debugging
        sweep,
        recompute,
      });
    } catch (e) {
      try { await sql`ROLLBACK`; } catch {}
      throw e;
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}