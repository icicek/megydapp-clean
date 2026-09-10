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

    // Advisory lock:
    // Prevent concurrent finalize operations for the same phase.
    // Snapshot/finalize serialization is additionally protected
    // by the phase row FOR UPDATE lock.
    const lockKey = (BigInt(942003) * BigInt(1_000_000_000) + BigInt(Math.trunc(phaseId))).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint);`;

    try {
      await sql`BEGIN;`;

      const rows = (await sql`
        SELECT
          id,
          phase_no,
          status,
          snapshot_taken_at,
          finalized_at,
          is_test
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

      const phaseNo =
        Number(ph.phase_no);

      const isTest =
        Boolean(ph.is_test);

      // ✅ Idempotent: zaten finalized ise success dön
      if (ph.finalized_at) {
        await sql`ROLLBACK`;

        return NextResponse.json({
          success: true,
          phaseId,
          phaseNo,
          scope: isTest
            ? 'test'
            : 'production',
          finalized_at:
            ph.finalized_at,
          message:
            'ℹ️ Phase already finalized.',
        });
      }

      // Finality scope integrity:
      // A phase can only become economically final if every
      // underlying allocation belongs to a contribution from
      // the same test/production scope.
      const scopeIntegrityRows =
        (await sql/* sql */`
          SELECT
            COUNT(*)::int AS invalid_count
          FROM phase_allocations pa
          LEFT JOIN contributions c
            ON c.id = pa.contribution_id
          WHERE pa.phase_id = ${phaseId}
            AND (
              c.id IS NULL
              OR c.is_test IS DISTINCT FROM ${isTest}
            )
        `) as any[];

      const invalidScopeCount =
        Number(
          scopeIntegrityRows?.[0]?.invalid_count ?? 0
        );

      if (invalidScopeCount > 0) {
        await sql`ROLLBACK`;

        return NextResponse.json(
          {
            success: false,
            error:
              'PHASE_SCOPE_INTEGRITY_FAILED',
            phaseId,
            phaseNo,
            scope: isTest
              ? 'test'
              : 'production',
            invalidAllocations:
              invalidScopeCount,
          },
          { status: 409 }
        );
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

      const allocRows =
        toNum(alloc?.[0]?.n_rows);

      const snap = (await sql`
        SELECT
          COALESCE(
            SUM(contribution_usd),
            0
          )::numeric AS usd_sum,

          COALESCE(
            SUM(megy_amount),
            0
          )::numeric AS megy_sum,

          COALESCE(
            SUM(megy_amount_base),
            0
          )::numeric AS megy_base_sum,

          COUNT(*)::int AS n_wallets,

          COALESCE(
            SUM(share_ratio),
            0
          )::numeric AS share_ratio_sum

        FROM claim_snapshots
        WHERE phase_id = ${phaseId};
      `) as any[];

      const allocUsd = toNum(alloc?.[0]?.usd_sum);
      const allocMegy = toNum(alloc?.[0]?.megy_sum);
      const allocWallets = toNum(alloc?.[0]?.n_wallets);

      const snapUsd = toNum(snap?.[0]?.usd_sum);
      const snapMegy = toNum(snap?.[0]?.megy_sum);
      const snapMegyBase =
        BigInt(
          String(
            snap?.[0]?.megy_base_sum ?? '0'
          )
        );
      const snapWallets = toNum(snap?.[0]?.n_wallets);
      const shareSum = toNum(snap?.[0]?.share_ratio_sum);

      const USD_EPS = 0.01;
      const MEGY_EPS = 0.0001;
      const SHARE_EPS = 1e-4;

      if (
        allocRows <= 0 ||
        allocMegy <= 0
      ) {
        await sql`ROLLBACK`;

        return NextResponse.json(
          {
            success: false,
            error:
              'NO_ALLOCATIONS_TO_FINALIZE',
            phaseId,
            phaseNo,
          },
          { status: 409 }
        );
      }

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
      const walletsOk =
        allocWallets === snapWallets;
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

      if (!isTest) {
        /*
         * Tokenomics v1
         *
         * Coincarnation                    75%
         * Partnerships & Ecosystem Growth  10%
         * Fair Future Fund Reserve          5%
         * Liquidity                         5%
         * Team & Contributors               5%
         *
         * Finalized Coincarnation entitlement represents
         * the 75% Coincarnation share.
         */
      
        if (snapMegyBase <= 0n) {
          throw new Error(
            'MEGY_ISSUANCE_BASE_INVALID'
          );
        }
      
        /*
         * 75 : 25 = 3 : 1
         *
         * Use integer base-unit accounting only.
         */
        const ecosystemAuthorizedBase =
          snapMegyBase / 3n;
      
        /*
         * Ecosystem 25% is divided:
         *
         * Partnerships = 10% of total = 40% of ecosystem
         * FFF          =  5% of total = 20% of ecosystem
         * Liquidity    =  5% of total = 20% of ecosystem
         * Team         =  5% of total = 20% of ecosystem
         *
         * Any indivisible base-unit remainder is assigned
         * deterministically to Partnerships & Ecosystem Growth.
         */
        const ecosystemFifth =
          ecosystemAuthorizedBase / 5n;
      
        const fairFutureFundReserveBase =
          ecosystemFifth;
      
        const liquidityBase =
          ecosystemFifth;
      
        const teamContributorsBase =
          ecosystemFifth;
      
        const partnershipsEcosystemGrowthBase =
          ecosystemAuthorizedBase -
          fairFutureFundReserveBase -
          liquidityBase -
          teamContributorsBase;
      
        const totalAuthorizedBase =
          snapMegyBase +
          ecosystemAuthorizedBase;
      
        await sql`
          INSERT INTO megy_issuance_ledger (
            phase_id,
            tokenomics_version,
            coincarnation_authorized_base,
            partnerships_ecosystem_growth_base,
            fair_future_fund_reserve_base,
            liquidity_base,
            team_contributors_base,
            ecosystem_authorized_base,
            total_authorized_base,
            created_at,
            updated_at
          )
          VALUES (
            ${phaseId},
            'v1-75-10-5-5-5',
            ${snapMegyBase.toString()}::numeric,
            ${partnershipsEcosystemGrowthBase.toString()}::numeric,
            ${fairFutureFundReserveBase.toString()}::numeric,
            ${liquidityBase.toString()}::numeric,
            ${teamContributorsBase.toString()}::numeric,
            ${ecosystemAuthorizedBase.toString()}::numeric,
            ${totalAuthorizedBase.toString()}::numeric,
            NOW(),
            NOW()
          )
        `;
      }

      await sql`COMMIT;`;

      return NextResponse.json({
        success: true,
        phaseId,
        phaseNo,
        scope: isTest
          ? 'test'
          : 'production',
        finalized_at:
          up?.[0]?.finalized_at ?? null,
        message:
          '✅ Phase finalized (approved).',
      });
    } catch (e) {
      try {
        await sql`ROLLBACK;`;
      } catch { }
      throw e;
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint);`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}