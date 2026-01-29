// app/api/admin/phases/[id]/finalize/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nearlyEqual(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps;
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = toId(ctx?.params);
    if (!phaseId) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    // Advisory lock (snapshot ile aynı anda finalize olmasın)
    const lockKey = (BigInt(942003) * BigInt(1_000_000_000) + BigInt(Math.trunc(phaseId))).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint);`;

    try {
      await sql`BEGIN;`;

      const rows = (await sql`
        SELECT id, status, snapshot_taken_at, finalized_at
        FROM phases
        WHERE id = ${phaseId}
        LIMIT 1
        FOR UPDATE;
      `) as any[];

      const ph = rows?.[0];
      if (!ph) {
        await sql`ROLLBACK;`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
      }

      if (!ph.snapshot_taken_at) {
        await sql`ROLLBACK;`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_SNAPSHOTTED' }, { status: 409 });
      }

      if (String(ph.status) !== 'completed') {
        await sql`ROLLBACK;`;
        return NextResponse.json({ success: false, error: 'PHASE_NOT_COMPLETED' }, { status: 409 });
      }

      // ✅ Idempotent: zaten finalized ise success dön
      if (ph.finalized_at) {
        await sql`ROLLBACK;`;
        return NextResponse.json({
          success: true,
          phaseId,
          finalized_at: ph.finalized_at,
          message: 'ℹ️ Phase already finalized.',
        });
      }

      // ✅ Finalize öncesi "mismatch" guard (alloc totals vs claim_snapshots totals)
      const alloc = (await sql`
        SELECT
          COALESCE(SUM(usd_allocated),0)::numeric AS usd_sum,
          COALESCE(SUM(megy_allocated),0)::numeric AS megy_sum,
          COUNT(DISTINCT wallet_address)::int AS n_wallets,
          COUNT(*)::int AS n_rows
        FROM phase_allocations
        WHERE phase_id = ${phaseId};
      `) as any[];

      const snap = (await sql`
        SELECT
          COALESCE(SUM(contribution_usd),0)::numeric AS usd_sum,
          COALESCE(SUM(megy_amount),0)::numeric AS megy_sum,
          COUNT(*)::int AS n_wallets,
          COALESCE(SUM(share_ratio),0)::numeric AS share_ratio_sum
        FROM claim_snapshots
        WHERE phase_id = ${phaseId};
      `) as any[];

      const allocUsd = toNum(alloc?.[0]?.usd_sum);
      const allocMegy = toNum(alloc?.[0]?.megy_sum);
      const allocWallets = toNum(alloc?.[0]?.n_wallets);

      const snapUsd = toNum(snap?.[0]?.usd_sum);
      const snapMegy = toNum(snap?.[0]?.megy_sum);
      const snapWallets = toNum(snap?.[0]?.n_wallets);
      const shareSum = toNum(snap?.[0]?.share_ratio_sum);

      const USD_EPS = 0.01;
      const MEGY_EPS = 0.0001;
      const SHARE_EPS = 1e-4;

      // Snapshots yoksa finalize etme (snapshot route rebuild etmiş olmalı)
      if (snapWallets <= 0) {
        await sql`ROLLBACK;`;
        return NextResponse.json(
          { success: false, error: 'NO_CLAIM_SNAPSHOTS', phaseId, alloc: alloc?.[0] ?? null, snap: snap?.[0] ?? null },
          { status: 409 }
        );
      }

      const megyOk = nearlyEqual(allocMegy, snapMegy, MEGY_EPS);
      const usdOk = nearlyEqual(allocUsd, snapUsd, USD_EPS);
      const walletsOk = allocWallets === 0 || snapWallets === 0 ? true : allocWallets === snapWallets;
      const shareOk = nearlyEqual(shareSum, 1, SHARE_EPS);

      if (!megyOk || !usdOk || !walletsOk || !shareOk) {
        await sql`ROLLBACK;`;
        return NextResponse.json(
          {
            success: false,
            error: 'FINALIZE_BLOCKED_MISMATCH',
            phaseId,
            checks: { megyOk, usdOk, walletsOk, shareOk },
            totals: {
              allocations: { usd: allocUsd, megy: allocMegy, wallets: allocWallets },
              claim_snapshots: { usd: snapUsd, megy: snapMegy, wallets: snapWallets, shareSum },
            },
            message: 'Finalize blocked: totals mismatch. Review Claim Preview anomalies first.',
          },
          { status: 409 }
        );
      }

      const up = (await sql`
        UPDATE phases
        SET finalized_at = NOW(), updated_at = NOW()
        WHERE id = ${phaseId} AND finalized_at IS NULL
        RETURNING finalized_at;
      `) as any[];

      await sql`COMMIT;`;

      return NextResponse.json({
        success: true,
        phaseId,
        finalized_at: up?.[0]?.finalized_at ?? null,
        message: '✅ Phase finalized (approved).',
      });
    } catch (e) {
      try {
        await sql`ROLLBACK;`;
      } catch {}
      throw e;
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint);`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}