//app/api/admin/phase-review/phases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        await requireAdmin(req);

        const rows = await sql`
        WITH phase_token_counts AS (
            SELECT
            pa.phase_id,
            COUNT(DISTINCT c.token_contract) AS token_count
            FROM phase_allocations pa
            JOIN contributions c
            ON c.id = pa.contribution_id
            WHERE c.token_contract IS NOT NULL
            AND c.token_contract <> ''
            GROUP BY pa.phase_id
        ),
        phase_review_counts AS (
            SELECT
            phase_id,
            COUNT(DISTINCT mint) FILTER (WHERE reviewed_at IS NOT NULL) AS reviewed_count
            FROM phase_token_reviews
            GROUP BY phase_id
        )
        SELECT
            p.id AS phase_id,
            p.phase_no,
            p.name,
            p.status,
            COALESCE(ptc.token_count, 0)::int AS token_count,
            COALESCE(prc.reviewed_count, 0)::int AS reviewed_count,
            GREATEST(
            COALESCE(ptc.token_count, 0) - COALESCE(prc.reviewed_count, 0),
            0
            )::int AS unreviewed_count
        FROM phases p
        LEFT JOIN phase_token_counts ptc
            ON ptc.phase_id = p.id
        LEFT JOIN phase_review_counts prc
            ON prc.phase_id = p.id
        WHERE p.status IN ('active', 'reviewing')
            AND COALESCE(ptc.token_count, 0) > 0
            AND COALESCE(ptc.token_count, 0) > COALESCE(prc.reviewed_count, 0)
        ORDER BY p.phase_no DESC, p.id DESC
        `;

        return NextResponse.json({
            success: true,
            phases: rows ?? [],
        });
    } catch (err: any) {
        console.error('admin phase review phases failed:', err);

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