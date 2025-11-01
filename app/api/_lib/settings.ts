// app/api/_lib/settings.ts
import { sql } from '@/app/api/_lib/db';
import { cache } from '@/app/api/_lib/cache';

/** --------------------------------------------------------------------
 * Genel not:
 * - admin_config(key text primary key, value jsonb, updated_by text, updated_at timestamptz, ...)
 * - Aşağıdaki tüm ayarlar cache'lenir (in-memory) ve invalidation fonksiyonları vardır.
 * - Varsayılanlar ENV'den okunur; DB'de yoksa ENV → yoksa fallback.
 * ------------------------------------------------------------------- */

const SETTINGS_TTL = 60; // saniye

/* ============================== Vote Threshold ============================== */
const KEY_VOTE = 'vote_threshold';
const CACHE_VOTE = `settings:${KEY_VOTE}`;

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

/* =============================== Include CEX =============================== */
const KEY_CEX = 'include_cex';
const CACHE_CEX = `settings:${KEY_CEX}`;

function envIncludeCexDefault(): boolean {
  // Geri uyum: VOLUME_INCLUDE_CEX env → 'true' ise açık
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

/* ====================== Classification Thresholds (4) ====================== */
/** Healthy min volume (USD) */
const KEY_H_VOL = 'healthy_min_vol_usd';
const CACHE_H_VOL = `settings:${KEY_H_VOL}`;
function envHealthyMinVolDefault(): number {
  const raw = process.env.HEALTHY_MIN_VOL_USD ?? process.env.HEALTHY_MIN_USD ?? '10000';
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : 10000;
}
export async function getHealthyMinVol(): Promise<number> {
  const hit = cache.get<number>(CACHE_H_VOL);
  if (typeof hit === 'number') return hit;
  const rows = (await sql`SELECT value FROM admin_config WHERE key = ${KEY_H_VOL}`) as unknown as { value:any }[];
  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envHealthyMinVolDefault();
  cache.set(CACHE_H_VOL, t, SETTINGS_TTL);
  return t;
}
export function invalidateHealthyMinVol() { try { cache.del(CACHE_H_VOL); } catch {} }

/** Healthy min liquidity (USD) */
const KEY_H_LIQ = 'healthy_min_liq_usd';
const CACHE_H_LIQ = `settings:${KEY_H_LIQ}`;
function envHealthyMinLiqDefault(): number {
  const raw = process.env.HEALTHY_MIN_LIQ_USD ?? '10000';
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : 10000;
}
export async function getHealthyMinLiq(): Promise<number> {
  const hit = cache.get<number>(CACHE_H_LIQ);
  if (typeof hit === 'number') return hit;
  const rows = (await sql`SELECT value FROM admin_config WHERE key = ${KEY_H_LIQ}`) as unknown as { value:any }[];
  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envHealthyMinLiqDefault();
  cache.set(CACHE_H_LIQ, t, SETTINGS_TTL);
  return t;
}
export function invalidateHealthyMinLiq() { try { cache.del(CACHE_H_LIQ); } catch {} }

/** WalkingDead min volume (USD) */
const KEY_WD_VOL = 'walking_dead_min_vol_usd';
const CACHE_WD_VOL = `settings:${KEY_WD_VOL}`;
function envWdMinVolDefault(): number {
  const raw = process.env.WALKING_DEAD_MIN_VOL_USD ?? process.env.WALKING_DEAD_MIN_USD ?? '100';
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : 100;
}
export async function getWdMinVol(): Promise<number> {
  const hit = cache.get<number>(CACHE_WD_VOL);
  if (typeof hit === 'number') return hit;
  const rows = (await sql`SELECT value FROM admin_config WHERE key = ${KEY_WD_VOL}`) as unknown as { value:any }[];
  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envWdMinVolDefault();
  cache.set(CACHE_WD_VOL, t, SETTINGS_TTL);
  return t;
}
export function invalidateWdMinVol() { try { cache.del(CACHE_WD_VOL); } catch {} }

/** WalkingDead min liquidity (USD) */
const KEY_WD_LIQ = 'walking_dead_min_liq_usd';
const CACHE_WD_LIQ = `settings:${KEY_WD_LIQ}`;
function envWdMinLiqDefault(): number {
  const raw = process.env.WALKING_DEAD_MIN_LIQ_USD ?? '100';
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : 100;
}
export async function getWdMinLiq(): Promise<number> {
  const hit = cache.get<number>(CACHE_WD_LIQ);
  if (typeof hit === 'number') return hit;
  const rows = (await sql`SELECT value FROM admin_config WHERE key = ${KEY_WD_LIQ}`) as unknown as { value:any }[];
  const val = rows[0]?.value?.value;
  const t = Number.isFinite(val) ? Number(val) : envWdMinLiqDefault();
  cache.set(CACHE_WD_LIQ, t, SETTINGS_TTL);
  return t;
}
export function invalidateWdMinLiq() { try { cache.del(CACHE_WD_LIQ); } catch {} }

/* --------------- Convenience: hepsini tek fonksiyonla çek ---------------- */
export async function getClassificationThresholds() {
  const [
    healthyMinVolUSD,
    healthyMinLiqUSD,
    walkingDeadMinVolUSD,
    walkingDeadMinLiqUSD,
  ] = await Promise.all([
    getHealthyMinVol(),
    getHealthyMinLiq(),
    getWdMinVol(),
    getWdMinLiq(),
  ]);
  return { healthyMinVolUSD, healthyMinLiqUSD, walkingDeadMinVolUSD, walkingDeadMinLiqUSD };
}

/* --------------- Convenience: invalidate hepsi ---------------------------- */
export function invalidateClassificationThresholds() {
  invalidateHealthyMinVol();
  invalidateHealthyMinLiq();
  invalidateWdMinVol();
  invalidateWdMinLiq();
}
