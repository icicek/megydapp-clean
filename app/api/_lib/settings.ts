// app/api/_lib/settings.ts
import { sql } from '@/app/api/_lib/db';
import { cache } from '@/app/api/_lib/cache';

/** ------- Vote Threshold ------- */
const KEY_VOTE = 'vote_threshold';
const CACHE_VOTE = `settings:${KEY_VOTE}`;
const SETTINGS_TTL = 60; // saniye

function envVoteDefault(): number {
  const raw = process.env.DEADCOIN_VOTE_THRESHOLD ?? '3';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

export async function getVoteThreshold(): Promise<number> {
  const hit = cache.get<number>(CACHE_VOTE);
  if (typeof hit === 'number') return hit;

  const rows = (await sql`
    SELECT value FROM admin_config WHERE key = ${KEY_VOTE}
  `) as unknown as { value: any }[];

  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envVoteDefault();

  cache.set(CACHE_VOTE, t, SETTINGS_TTL);
  return t;
}

export function invalidateVoteThresholdCache() {
  try { cache.del(CACHE_VOTE); } catch {}
}

/** ------- Include CEX flag ------- */
const KEY_CEX = 'include_cex';
const CACHE_CEX = `settings:${KEY_CEX}`;

function envIncludeCexDefault(): boolean {
  // Geriye uyum: VOLUME_INCLUDE_CEX env → 'true' ise açık
  return String(process.env.VOLUME_INCLUDE_CEX || '').toLowerCase() === 'true';
}

export async function getIncludeCex(): Promise<boolean> {
  const hit = cache.get<boolean>(CACHE_CEX);
  if (typeof hit === 'boolean') return hit;

  const rows = (await sql`
    SELECT value FROM admin_config WHERE key = ${KEY_CEX}
  `) as unknown as { value: any }[];

  const val = rows[0]?.value?.value;
  const t = typeof val === 'boolean' ? val : envIncludeCexDefault();

  cache.set(CACHE_CEX, t, SETTINGS_TTL);
  return t;
}

export function invalidateIncludeCexCache() {
  try { cache.del(CACHE_CEX); } catch {}
}
