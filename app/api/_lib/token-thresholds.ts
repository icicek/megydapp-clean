// app/api/_lib/token-thresholds.ts
import { sql } from '@/app/api/_lib/db';

/**
 * Token classification thresholds (DB-backed via admin_config).
 * Keys (agreed):
 * - healthy_min_liq_usd
 * - healthy_min_vol_usd
 * - walking_dead_min_liq_usd
 * - walking_dead_min_vol_usd
 *
 * We cache in-memory with TTL (serverless best-effort).
 * Admin config update endpoint should call invalidateTokenThresholdsCache().
 */

export type TokenThresholds = {
  healthyMinLiq: number;
  healthyMinVol: number;
  walkingDeadMinLiq: number;
  walkingDeadMinVol: number;
};

const KEYS = {
  healthyMinLiq: 'healthy_min_liq_usd',
  healthyMinVol: 'healthy_min_vol_usd',
  walkingDeadMinLiq: 'walking_dead_min_liq_usd',
  walkingDeadMinVol: 'walking_dead_min_vol_usd',
} as const;

const DEFAULTS: TokenThresholds = {
  healthyMinLiq: 10_000,
  healthyMinVol: 10_000,
  walkingDeadMinLiq: 100,
  walkingDeadMinVol: 100,
};

// Small TTL cache (best-effort in serverless)
const CACHE_KEY = 'token_thresholds:v1';
const TTL_MS = Number(process.env.TOKEN_THRESHOLDS_TTL_MS ?? 60_000);

type CacheEntry = { val: TokenThresholds; exp: number };
const mem = new Map<string, CacheEntry>();

function now() {
  return Date.now();
}

function asNumber(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampNonNeg(n: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n;
}

async function readAdminConfigValues(keys: string[]): Promise<Record<string, any>> {
  // admin_config.value is jsonb; in our system it is usually { value: X }
  const rows = await sql/* sql */`
    SELECT key, value
    FROM admin_config
    WHERE key = ANY(${keys}::text[])
  `;

  const out: Record<string, any> = {};
  for (const r of rows as any[]) {
    const raw = r?.value ?? null;
    const val = typeof raw === 'object' && raw !== null && 'value' in raw ? (raw as any).value : raw;
    out[String(r.key)] = val;
  }
  return out;
}

/**
 * Get thresholds from DB (admin_config) with TTL cache.
 * If DB missing/invalid, falls back to DEFAULTS.
 */
export async function getTokenThresholds(opts: { noCache?: boolean } = {}): Promise<TokenThresholds> {
  if (!opts.noCache) {
    const hit = mem.get(CACHE_KEY);
    if (hit && hit.exp > now()) return hit.val;
  }

  try {
    const keys = Object.values(KEYS);
    const vals = await readAdminConfigValues(keys);

    const healthyMinLiq = clampNonNeg(
      asNumber(vals[KEYS.healthyMinLiq] ?? DEFAULTS.healthyMinLiq) ?? DEFAULTS.healthyMinLiq,
      DEFAULTS.healthyMinLiq
    );

    const healthyMinVol = clampNonNeg(
      asNumber(vals[KEYS.healthyMinVol] ?? DEFAULTS.healthyMinVol) ?? DEFAULTS.healthyMinVol,
      DEFAULTS.healthyMinVol
    );

    const walkingDeadMinLiq = clampNonNeg(
      asNumber(vals[KEYS.walkingDeadMinLiq] ?? DEFAULTS.walkingDeadMinLiq) ?? DEFAULTS.walkingDeadMinLiq,
      DEFAULTS.walkingDeadMinLiq
    );

    const walkingDeadMinVol = clampNonNeg(
      asNumber(vals[KEYS.walkingDeadMinVol] ?? DEFAULTS.walkingDeadMinVol) ?? DEFAULTS.walkingDeadMinVol,
      DEFAULTS.walkingDeadMinVol
    );

    const out: TokenThresholds = {
      healthyMinLiq,
      healthyMinVol,
      walkingDeadMinLiq,
      walkingDeadMinVol,
    };

    mem.set(CACHE_KEY, { val: out, exp: now() + TTL_MS });
    return out;
  } catch (e) {
    // Fail-safe: if DB read fails, return defaults (do NOT break Coincarnation)
    const out = { ...DEFAULTS };
    mem.set(CACHE_KEY, { val: out, exp: now() + Math.min(10_000, TTL_MS) });
    return out;
  }
}

/**
 * Explicitly invalidates the thresholds cache.
 * Call this after admin_config updates to threshold keys.
 */
export function invalidateTokenThresholdsCache() {
  mem.delete(CACHE_KEY);
}

// Export key names (handy for admin endpoint checks)
export const TOKEN_THRESHOLD_KEYS = new Set<string>(Object.values(KEYS));
