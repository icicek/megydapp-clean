// app/api/admin/phases/[id]/snapshot/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { recomputeFromPhaseId } from '@/app/api/_lib/phases/recompute';

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

    await recomputeFromPhaseId(Number(phaseId));

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

      // Sadece active phase snapshot alınsın (kuralı sen netleştiriyorsun)
      if (String(ph.status) !== 'active') {
        await sql`ROLLBACK`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_ACTIVE' }, { status: 409 });
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
          0::int AS coincarnator_no,
          SUM(pa.usd_allocated)::numeric AS contribution_usd,
          (SUM(pa.megy_allocated)::float / ${megySum})::numeric AS share_ratio,
          NOW() AS created_at
        FROM phase_allocations pa
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

      // ✅ NEXT PHASE: try auto-open, but don't fail snapshot if none exists
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
            AND phase_no > ${phaseNo}
            AND rate_usd_per_megy >= ${currentRate}
          ORDER BY phase_no ASC
          LIMIT 1
          FOR UPDATE
        )
        RETURNING id, phase_no
      `) as any[];

      const nextRow = next?.[0] || null;

      // ✅ Commit ALWAYS (snapshot must succeed)
      await sql`COMMIT`;

      // recompute: sadece yeni phase açıldıysa
      let recompute: any = null;
      if (nextRow?.id) {
        recompute = await recomputeFromPhaseId(Number(nextRow.id));
      }

      const message = nextRow?.id
        ? `✅ Snapshot complete → Next opened: #${Number(nextRow.phase_no)}`
        : `✅ Snapshot complete — No next phase to open.`;

      return NextResponse.json({
        success: true,
        message,
        phaseId,
        phaseNo,
        snapshot_taken_at: snapshotAt,
        totals: { usdSum, megySum, allocations: nAlloc },
        nextOpened: nextRow ? { id: Number(nextRow.id), phaseNo: Number(nextRow.phase_no) } : null,
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