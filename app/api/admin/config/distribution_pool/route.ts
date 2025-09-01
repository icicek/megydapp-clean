// app/api/admin/config/distribution_pool/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const result = await sql`
      SELECT value FROM config WHERE key = 'distribution_pool' LIMIT 1;
    `;

    const raw = (result as { value?: string }[])[0]?.value;

    if (!raw || isNaN(Number(raw))) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing value in config table.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      value: Number(raw),
    });
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
