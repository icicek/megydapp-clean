// app/api/admin/phases/[id]/snapshot/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function POST(req: NextRequest, context: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = Number(context?.params?.id);
    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid phase id' }, { status: 400 });
    }

    // phase-bazlı lock (snapshot da tekil olmalı)
    const lockKey = (BigInt(942002) * BigInt(1_000_000_000) + BigInt(Math.trunc(phaseId))).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

    try {
      // 1) phase'i kilitleyerek oku
      const rows = (await sql/* sql */`
        SELECT id, phase_no, status, snapshot_taken_at
        FROM phases
        WHERE id = ${phaseId}
        LIMIT 1
        FOR UPDATE
      `) as any[];

      const ph = rows?.[0];
      if (!ph) {
        return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
      }

      if (ph.snapshot_taken_at) {
        return NextResponse.json({ success: false, error: 'PHASE_ALREADY_SNAPSHOTTED' }, { status: 409 });
      }

      // 2) phase için allocation var mı?
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
        return NextResponse.json(
          { success: false, error: 'NO_ALLOCATIONS_TO_SNAPSHOT', phaseId, usdSum, megySum, nAlloc },
          { status: 409 }
        );
      }

      // 3) snapshot_taken_at set
      const nowRow = (await sql/* sql */`
        UPDATE phases
        SET snapshot_taken_at = NOW()
        WHERE id = ${phaseId} AND snapshot_taken_at IS NULL
        RETURNING snapshot_taken_at
      `) as any[];

      const snapshotAt = nowRow?.[0]?.snapshot_taken_at;

      // 4) claim_snapshots üret: önce bu phase'e ait wallet'ları hesapla
      // Not: Eğer claim_snapshots tablonda "phase_id" yoksa, bu snapshot "global" olur.
      // Eğer ileride multi-phase snapshot istiyorsan claim_snapshots'a phase_id eklemeyi öneririm.
      //
      // Şimdilik: Bu phase snapshot'ı "megy_amount/contribution_usd/share_ratio" üretir.
      //
      // ALSO: Aynı wallet için eski snapshot varsa overwrite mi? -> Güvenlisi: INSERT...ON CONFLICT.
      // claim_snapshots'ta unique(wallet_address) var mı bilmiyoruz.
      // Bu yüzden: önce DELETE (wallet seti ile) + INSERT yapalım.
      const wallets = (await sql/* sql */`
        SELECT DISTINCT wallet_address
        FROM phase_allocations
        WHERE phase_id = ${phaseId}
      `) as any[];

      const walletObjs = (wallets || []).map((w: any) => ({ wallet: String(w.wallet_address || '') })).filter((x: any) => x.wallet);

      if (walletObjs.length) {
        // Bu phase'ten gelen wallet'lar için eski snapshot'ı temizle (phase_id kolonun olmadığı için global temizliyoruz)
        await sql/* sql */`
          DELETE FROM claim_snapshots cs
          USING jsonb_to_recordset(${JSON.stringify(walletObjs)}::jsonb) AS x(wallet text)
          WHERE cs.phase_id = ${phaseId}
            AND cs.wallet_address = x.wallet::text
        `;
      }

      // 5) yeni snapshot insert
      // coincarnator_no: Eğer participants tablon varsa buraya JOIN ekleyebilirsin.
      // Şimdilik: 0 yazıyoruz (daha sonra upgrade edeceğiz).
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

      // 6) phase transitions: close current, open next (if planned)
      await sql/* sql */`
        UPDATE phases
        SET status = 'closed',
            status_v2 = 'finalized'
        WHERE id = ${phaseId};
      `;

      await sql/* sql */`
        UPDATE phases
        SET status = 'open',
            status_v2 = 'active'
        WHERE phase_no = (
        SELECT phase_no + 1 FROM phases WHERE id = ${phaseId}
        )
        AND status = 'planned'
        AND snapshot_taken_at IS NULL;
      `;

      return NextResponse.json({
        success: true,
        phaseId,
        phaseNo: Number(ph.phase_no),
        snapshot_taken_at: snapshotAt,
        totals: { usdSum, megySum, allocations: nAlloc },
        wallets: walletObjs.length,
      });
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
