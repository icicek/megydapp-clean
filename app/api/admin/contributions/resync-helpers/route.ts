//app/api/admin/contributions/resync-helpers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req as any);
    await requireAdmin(req as any);

    const body = await req.json().catch(() => ({}));
    const contributionId = toInt(body?.contribution_id);
    const mint = typeof body?.mint === 'string' && body.mint.trim() ? body.mint.trim() : null;
    const all = body?.all === true;

    if (!contributionId && !mint && !all) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide contribution_id or mint or { all: true }',
        },
        { status: 400 }
      );
    }

    const lockKey = (BigInt(942005) * BigInt(1_000_000_000) + BigInt(1)).toString();
    await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

    try {
      await sql`BEGIN`;

      let whereSql;
      if (contributionId) {
        whereSql = sql`WHERE c.id = ${contributionId}`;
      } else if (mint) {
        whereSql = sql`WHERE c.token_contract = ${mint}`;
      } else {
        whereSql = sql``;
      }

      const updated = (await sql/* sql */`
        WITH target AS (
          SELECT
            c.id,
            COALESCE(c.usd_value, 0)::numeric AS usd_value
          FROM contributions c
          ${whereSql}
          FOR UPDATE
        ),
        alloc AS (
          SELECT
            pa.contribution_id,
            COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS usd_alloc_total
          FROM phase_allocations pa
          JOIN target t ON t.id = pa.contribution_id
          GROUP BY pa.contribution_id
        ),
        invalid AS (
          SELECT
            ci.contribution_id,
            COALESCE(SUM(COALESCE(ci.invalidated_usd,0)::numeric),0)::numeric AS invalidated_usd_total
          FROM contribution_invalidations ci
          JOIN target t ON t.id = ci.contribution_id
          GROUP BY ci.contribution_id
        ),
        last_alloc AS (
          SELECT DISTINCT ON (pa.contribution_id)
            pa.contribution_id,
            pa.phase_id,
            p.phase_no
          FROM phase_allocations pa
          JOIN phases p ON p.id = pa.phase_id
          JOIN target t ON t.id = pa.contribution_id
          ORDER BY pa.contribution_id, p.phase_no DESC, pa.created_at DESC
        ),
        has_snapshot AS (
          SELECT DISTINCT
            pa.contribution_id
          FROM phase_allocations pa
          JOIN phases p ON p.id = pa.phase_id
          JOIN target t ON t.id = pa.contribution_id
          WHERE p.snapshot_taken_at IS NOT NULL
        )
        UPDATE contributions c
        SET
          alloc_status = CASE
            WHEN EXISTS (
              SELECT 1
              FROM has_snapshot hs
              WHERE hs.contribution_id = c.id
            ) THEN 'snapshotted'
            WHEN COALESCE(a.usd_alloc_total, 0)::numeric > 0 THEN 'allocated'
            WHEN COALESCE(i.invalidated_usd_total, 0)::numeric > 0 THEN 'invalidated'
            WHEN COALESCE(c.usd_value, 0)::numeric > 0 THEN 'unassigned'
            ELSE COALESCE(c.alloc_status, 'unassigned')
          END,
          phase_id = CASE
            WHEN EXISTS (
              SELECT 1
              FROM has_snapshot hs
              WHERE hs.contribution_id = c.id
            ) THEN la.phase_id
            WHEN COALESCE(a.usd_alloc_total, 0)::numeric > 0 THEN la.phase_id
            ELSE NULL
          END,
          alloc_phase_no = CASE
            WHEN EXISTS (
              SELECT 1
              FROM has_snapshot hs
              WHERE hs.contribution_id = c.id
            ) THEN la.phase_no
            WHEN COALESCE(a.usd_alloc_total, 0)::numeric > 0 THEN la.phase_no
            ELSE NULL
          END,
          alloc_updated_at = NOW()
        FROM target t
        LEFT JOIN alloc a
          ON a.contribution_id = t.id
        LEFT JOIN invalid i
          ON i.contribution_id = t.id
        LEFT JOIN last_alloc la
          ON la.contribution_id = t.id
        WHERE c.id = t.id
        RETURNING
          c.id,
          c.token_symbol,
          c.token_contract,
          c.alloc_status,
          c.phase_id,
          c.alloc_phase_no,
          c.alloc_updated_at
      `) as any[];

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        updated_count: updated.length,
        items: updated,
      });
    } catch (e) {
      try {
        await sql`ROLLBACK`;
      } catch {}
      throw e;
    } finally {
      await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
    }
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}