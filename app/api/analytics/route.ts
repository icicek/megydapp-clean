// app/api/analytics/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const ALLOWED_EVENTS = new Set([
  'smart_connect_shown',
  'smart_connect_inapp_hint_shown',
  'smart_connect_open_in_phantom',
  'smart_connect_open_in_solflare',
  'smart_connect_open_in_backpack',
  'smart_connect_walletconnect_hint',
  'wallet_connect_attempt',
  'wallet_connect_success',
  'wallet_connect_error',
]);

export async function POST(req: Request) {
  try {
    const { event, meta = {} } = await req.json() as { event?: string; meta?: any };
    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: 'invalid_event' }, { status: 400 });
    }

    await sql/* sql */`
      CREATE TABLE IF NOT EXISTS analytics_events(
        id bigserial primary key,
        event text not null,
        meta jsonb,
        ua text,
        ip text,
        created_at timestamptz default now()
      )
    `;

    const ua = req.headers.get('user-agent') ?? null;
    const ip = req.headers.get('x-forwarded-for') ?? null;

    await sql/* sql */`
      INSERT INTO analytics_events(event, meta, ua, ip)
      VALUES (${event}, ${meta}, ${ua}, ${ip})
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // UX’i bozmayalım; hatayı swallow edelim
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
