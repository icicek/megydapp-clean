//app/api/admin/phase-review/rules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const rows = await sql`
      SELECT
        id,
        mint,
        rule_type,
        note,
        created_by,
        created_at,
        updated_at
      FROM token_review_rules
      ORDER BY created_at DESC, id DESC
    `;

    return NextResponse.json({
      success: true,
      rules: rows ?? [],
    });
  } catch (err: any) {
    console.error('admin phase review rules list failed:', err);

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

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const mint = String(searchParams.get('mint') || '').trim();

    if (!mint) {
      return NextResponse.json(
        { success: false, error: 'MINT_REQUIRED' },
        { status: 400 }
      );
    }

    const rows = await sql`
      DELETE FROM token_review_rules
      WHERE mint = ${mint}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      removed: rows?.[0] ?? null,
    });
  } catch (err: any) {
    console.error('admin phase review rule delete failed:', err);

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