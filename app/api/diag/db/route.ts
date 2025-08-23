// app/api/diag/db/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import type { DBInfoRow, HasEnumRow, HasTableRow } from '@/app/api/_lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbInfo = (await sql`
      SELECT now() as now, current_database() as db
    `) as unknown as DBInfoRow[];

    const hasEnum = (await sql`
      SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname='token_status_enum') as has_enum
    `) as unknown as HasEnumRow[];

    const hasTable = (await sql`
      SELECT to_regclass('public.token_registry') as reg
    `) as unknown as HasTableRow[];

    return NextResponse.json({
      success: true,
      db: dbInfo[0]?.db,
      now: dbInfo[0]?.now,
      has_token_status_enum: !!hasEnum[0]?.has_enum,
      has_token_registry: !!hasTable[0]?.reg,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
