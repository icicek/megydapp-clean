import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';

const sql = neon(process.env.DATABASE_URL!);
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await sql`SELECT value FROM config WHERE key='app_enabled' LIMIT 1`;
    const v = (rows as {value:string}[])[0]?.value ?? 'true';
    return NextResponse.json({ success: true, value: v });
  } catch (e:any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req as any);
    verifyCsrf(req as any);
    const body = await req.json();
    const v = String(body?.value).toLowerCase();
    const normalized = v === 'false' || v === '0' ? 'false' : 'true';
    await sql`
      INSERT INTO config (key, value)
      VALUES ('app_enabled', ${normalized})
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value
    `;
    return NextResponse.json({ success: true, value: normalized });
  } catch (e:any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
