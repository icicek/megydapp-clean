// app/api/_lib/settings.ts
import { sql } from '@/app/api/_lib/db';
import { cache } from '@/app/api/_lib/cache';

const KEY = 'vote_threshold';
const CACHE_KEY = `settings:${KEY}`;
const SETTINGS_TTL = 60; // saniye

function envDefault(): number {
  const raw = process.env.DEADCOIN_VOTE_THRESHOLD ?? '3';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export async function getVoteThreshold(): Promise<number> {
  const hit = cache.get<number>(CACHE_KEY);
  if (typeof hit === 'number') return hit;

  // ❗ generic yerine çağrı sonrası cast kullanıyoruz
  const rows = (await sql`
    SELECT value FROM admin_config WHERE key = ${KEY}
  `) as unknown as { value: any }[];

  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envDefault();

  cache.set(CACHE_KEY, t, SETTINGS_TTL);
  return t;
}

export function invalidateVoteThresholdCache() {
  try { cache.del(CACHE_KEY); } catch {}
}
