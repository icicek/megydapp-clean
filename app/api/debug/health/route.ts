// app/api/debug/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function tryFetchJson(url: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store' });
    const ms = Date.now() - t0;
    let body: any = null;
    try { body = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, ms, sample: body && typeof body === 'object' ? Object.keys(body).slice(0, 3) : null };
  } catch (e: any) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: String(e?.message || e) };
  }
}

export async function GET(req: NextRequest) {
  // CRON_SECRET veya DEBUG_SECRET kabul
  const hdr = req.headers.get('x-debug-secret') || req.headers.get('x-cron-secret') || '';
  const secret = process.env.DEBUG_SECRET || process.env.CRON_SECRET || '';
  if (!secret || hdr !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const env = {
    hasDatabaseUrl: !!(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL),
    hasCronSecret: !!process.env.CRON_SECRET,
    cronEnabledEnv: process.env.CRON_ENABLED ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    node: process.version,
  };

  // DB check
  let db: any = { ok: false };
  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  const t0 = Date.now();
  if (!dbUrl) {
    db = { ok: false, error: 'missing DATABASE_URL/NEON_DATABASE_URL' };
  } else {
    try {
      const sql = neon(dbUrl);
      const one = await sql`select 1 as ok`;
      let count = null;
      try {
        const c = await sql`select count(*)::int as n from token_registry`;
        count = c?.[0]?.n ?? null;
      } catch {}
      db = { ok: one?.[0]?.ok === 1, ms: Date.now() - t0, token_registry_count: count };
    } catch (e: any) {
      db = { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
    }
  }

  // Network checks
  const jupMint  = await tryFetchJson(`https://price.jup.ag/v6/price?mints=${WSOL_MINT}`);
  const jupIdSol = await tryFetchJson(`https://price.jup.ag/v6/price?ids=SOL`);
  const coingeckoPing = await tryFetchJson(`https://api.coingecko.com/api/v3/ping`);

  // Feature flags
  let flags: any = {};
  try {
    const mod: any = await import('@/app/api/_lib/feature-flags');
    flags = {
      appEnabled:  typeof mod?.isAppEnabled  === 'function' ? await mod.isAppEnabled()  : null,
      cronEnabled: typeof mod?.isCronEnabled === 'function' ? await mod.isCronEnabled() : null,
    };
  } catch {
    flags = { appEnabled: null, cronEnabled: null };
  }

  const ok = !!(db.ok && (jupMint.ok || jupIdSol.ok));
  return NextResponse.json({ ok, env, db, net: { jupMint, jupIdSol, coingeckoPing }, flags });
}
