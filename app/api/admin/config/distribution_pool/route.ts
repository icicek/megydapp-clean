import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const result = await sql`SELECT value FROM config WHERE key='distribution_pool' LIMIT 1`;
    const raw = (result as {value?:string}[])[0]?.value;
    if (!raw || isNaN(Number(raw))) {
      return NextResponse.json({ success:false, error:'Invalid or missing value in config table.' }, { status:400 });
    }
    return NextResponse.json({ success:true, value:Number(raw) });
  } catch (err:any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin(req as any);
    verifyCsrf(req as any);
    const body = await req.json();
    const v = Number(body?.value);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ success:false, error:'value must be positive number' }, { status:400 });
    }
    await sql`
      INSERT INTO config (key, value)
      VALUES ('distribution_pool', ${String(v)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    return NextResponse.json({ success:true, value:v });
  } catch (err:any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
