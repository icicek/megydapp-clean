//app/api/admin/phases/[id]/tokens/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(v: string | null, d: number) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);

    const { id } = await ctx.params;
    const phaseId = Number(id);

    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);

    const review = String(searchParams.get('review') || 'all').toLowerCase();
    const status = String(searchParams.get('status') || '').trim();
    const q = String(searchParams.get('q') || '').trim();

    const limit = Math.min(Math.max(toInt(searchParams.get('limit'), 50), 1), 200);
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    const pattern = q ? `%${q}%` : null;

    const rows = (await sql/* sql */`
      WITH grouped AS (
        SELECT
          pa.phase_id,
          c.token_contract AS mint,
          COALESCE(MAX(c.token_symbol), '') AS token_symbol,
          COUNT(DISTINCT pa.contribution_id)::int AS contribution_count,
          COUNT(DISTINCT pa.wallet_address)::int AS wallet_count,
          COALESCE(SUM(COALESCE(pa.usd_allocated, 0)::numeric), 0)::numeric AS usd_total,
          COALESCE(SUM(COALESCE(pa.megy_allocated, 0)::numeric), 0)::numeric AS megy_total,
          MIN(pa.created_at) AS first_allocated_at,
          MAX(pa.created_at) AS last_allocated_at
        FROM phase_allocations pa
        JOIN contributions c
          ON c.id = pa.contribution_id
        WHERE pa.phase_id = ${phaseId}
          AND c.token_contract IS NOT NULL
          AND c.token_contract <> ''
        GROUP BY pa.phase_id, c.token_contract
      )
      SELECT
        g.phase_id,
        p.phase_no,
        p.name AS phase_name,
        p.status AS phase_status,

        g.mint,
        g.token_symbol,
        g.contribution_count,
        g.wallet_count,
        g.usd_total,
        g.megy_total,
        g.first_allocated_at,
        g.last_allocated_at,

        COALESCE(tr.status::text, 'healthy') AS status,
        tr.status_at,
        tr.reason,
        tr.updated_by,

        COALESCE(v.yes_count, 0)::int AS yes_count,

        ptr.reviewed_at,
        ptr.reviewed_by,
        ptr.review_note,
        CASE WHEN ptr.reviewed_at IS NULL THEN false ELSE true END AS reviewed,
        trr.rule_type AS global_review_rule,
        trr.note AS global_review_note

      FROM grouped g
      JOIN phases p
        ON p.id = g.phase_id

      LEFT JOIN token_registry tr
        ON tr.mint = g.mint

      LEFT JOIN phase_token_reviews ptr
        ON ptr.phase_id = g.phase_id
       AND ptr.mint = g.mint

      LEFT JOIN token_review_rules trr
        ON trr.mint = g.mint

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS yes_count
        FROM deadcoin_votes dv
        WHERE dv.mint = g.mint
          AND dv.vote_yes = TRUE
      ) v ON TRUE

      WHERE
        trr.mint IS NULL
        AND (${status || null}::text IS NULL OR COALESCE(tr.status::text, 'healthy') = ${status || null})
        AND (
          ${review} = 'all'
          OR (${review} = 'reviewed' AND ptr.reviewed_at IS NOT NULL)
          OR (${review} = 'unreviewed' AND ptr.reviewed_at IS NULL)
        )
        AND (
          ${pattern}::text IS NULL
          OR g.mint ILIKE ${pattern}
          OR g.token_symbol ILIKE ${pattern}
        )

      ORDER BY
        CASE WHEN ptr.reviewed_at IS NULL THEN 0 ELSE 1 END,
        g.usd_total DESC,
        g.last_allocated_at DESC

      LIMIT ${limit}
      OFFSET ${offset}
    `) as any[];

    return NextResponse.json({
      success: true,
      phase_id: phaseId,
      items: rows ?? [],
    });
  } catch (err: any) {
    console.error('admin phase tokens list failed:', err);

    if (err instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: err.code || 'AUTH_ERROR' },
        { status: err.status }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);

    const { id } = await ctx.params;
    const phaseId = Number(id);

    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const mint = String(body?.mint || '').trim();
    const reviewed = Boolean(body?.reviewed);
    const note = String(body?.note || '').trim();
    const skipFutureReviews = Boolean(body?.skip_future_reviews);

    if (!mint) {
      return NextResponse.json(
        { success: false, error: 'MINT_REQUIRED' },
        { status: 400 }
      );
    }

    if (skipFutureReviews) {
        const rows = (await sql/* sql */`
          INSERT INTO token_review_rules (
            mint,
            rule_type,
            note,
            created_by,
            created_at,
            updated_at
          )
          VALUES (
            ${mint},
            'trusted',
            ${note || null},
            'admin_ui',
            NOW(),
            NOW()
          )
          ON CONFLICT (mint)
          DO UPDATE SET
            rule_type = 'trusted',
            note = EXCLUDED.note,
            updated_at = NOW()
          RETURNING *
        `) as any[];
      
        return NextResponse.json({
          success: true,
          global_rule: rows?.[0] ?? null,
        });
    }

    if (reviewed) {
      const rows = (await sql/* sql */`
        INSERT INTO phase_token_reviews (
          phase_id,
          mint,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at,
          updated_at
        )
        VALUES (
          ${phaseId},
          ${mint},
          NOW(),
          'admin_ui',
          ${note || null},
          NOW(),
          NOW()
        )
        ON CONFLICT (phase_id, mint)
        DO UPDATE SET
          reviewed_at = NOW(),
          reviewed_by = 'admin_ui',
          review_note = EXCLUDED.review_note,
          updated_at = NOW()
        RETURNING *
      `) as any[];

      return NextResponse.json({
        success: true,
        review: rows?.[0] ?? null,
      });
    }

    const rows = (await sql/* sql */`
      UPDATE phase_token_reviews
      SET
        reviewed_at = NULL,
        reviewed_by = NULL,
        review_note = ${note || null},
        updated_at = NOW()
      WHERE phase_id = ${phaseId}
        AND mint = ${mint}
      RETURNING *
    `) as any[];

    return NextResponse.json({
      success: true,
      review: rows?.[0] ?? null,
    });
  } catch (err: any) {
    console.error('admin phase token review failed:', err);

    if (err instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: err.code || 'AUTH_ERROR' },
        { status: err.status }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}