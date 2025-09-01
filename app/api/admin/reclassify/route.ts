export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // opsiyonel ama stabil

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export async function POST(req: Request) {
  const header = req.headers.get('x-cron-secret') ?? '';
  const expected = process.env.CRON_SECRET ?? '';

  if (!expected) {
    return NextResponse.json({ ok: false, error: 'server_missing_cron_secret' }, { status: 500 });
  }
  if (!header) {
    return NextResponse.json({ ok: false, error: 'missing_header' }, { status: 401 });
  }
  if (header !== expected) {
    return NextResponse.json({ ok: false, error: 'bad_secret' }, { status: 401 });
  }

  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id serial PRIMARY KEY,
      ran_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await sql/* sql */`INSERT INTO cron_runs DEFAULT VALUES;`;

  return NextResponse.json({ ok: true });
}
