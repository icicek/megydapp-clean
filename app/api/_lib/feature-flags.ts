// app/api/_lib/feature-flags.ts
import { sql } from '@/app/api/_lib/db';
import { HttpError } from '@/app/api/_lib/jwt';

/* -------------------------------------------------------
 * Helpers
 * -----------------------------------------------------*/

/** Loose bool parser: "1/true/yes/on" -> true, "0/false/no/off" -> false */
function parseBoolLoose(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return def;
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return def;
}

/** Loose number parser with sane defaults */
function parseNumberLoose(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return def;
}

async function getConfigValueFromDB(key: string): Promise<string | null> {
  try {
    const rows = await sql/* sql */`
      SELECT value
      FROM admin_config
      WHERE key = ${key}
      LIMIT 1
    `;

    const arr = rows as unknown as Array<{ value?: any }>;
    const raw = arr?.[0]?.value;

    // admin_config.value genelde { "value": ... }
    if (raw && typeof raw === 'object' && raw.value != null) {
      return String(raw.value);
    }

    // fallback: direkt primitive json ise
    if (raw == null) return null;
    return typeof raw === 'string' ? raw : String(raw);
  } catch {
    return null;
  }
}

async function getConfigBooleanFromDB(key: string, def: boolean): Promise<boolean> {
  const raw = await getConfigValueFromDB(key);
  if (raw == null) return def;
  return parseBoolLoose(raw, def);
}

async function getConfigNumberFromDB(key: string, def: number): Promise<number> {
  const raw = await getConfigValueFromDB(key);
  if (raw == null) return def;
  return parseNumberLoose(raw, def);
}

/* -------------------------------------------------------
 * App Enabled
 * -----------------------------------------------------*/

export async function isAppEnabled(): Promise<boolean> {
  if (typeof process.env.APP_ENABLED === 'string') {
    return parseBoolLoose(process.env.APP_ENABLED, true);
  }
  return await getConfigBooleanFromDB('app_enabled', true);
}

export async function requireAppEnabled(): Promise<void> {
  const ok = await isAppEnabled();
  if (!ok) throw new HttpError(503, 'APP_DISABLED');
}

/* -------------------------------------------------------
 * Claim Open
 * -----------------------------------------------------*/

export async function isClaimOpen(): Promise<boolean> {
  if (typeof process.env.CLAIM_OPEN === 'string') {
    return parseBoolLoose(process.env.CLAIM_OPEN, false);
  }
  return await getConfigBooleanFromDB('claim_open', false);
}

export async function requireClaimOpen(): Promise<void> {
  const ok = await isClaimOpen();
  if (!ok) throw new HttpError(403, 'CLAIM_CLOSED');
}

/* -------------------------------------------------------
 * Distribution Pool (number)
 * -----------------------------------------------------*/

export async function getDistributionPoolNumber(): Promise<number> {
  if (typeof process.env.DISTRIBUTION_POOL === 'string') {
    return parseNumberLoose(process.env.DISTRIBUTION_POOL, 0);
  }
  return await getConfigNumberFromDB('distribution_pool', 0);
}

/* -------------------------------------------------------
 * Coincarnation Rate (number)
 * -----------------------------------------------------*/

export async function getCoincarnationRateNumber(): Promise<number> {
  if (typeof process.env.COINCARNATION_RATE === 'string') {
    return parseNumberLoose(process.env.COINCARNATION_RATE, 1);
  }
  return await getConfigNumberFromDB('coincarnation_rate', 1);
}

/* -------------------------------------------------------
 * Cron Enabled
 * -----------------------------------------------------*/

export async function isCronEnabled(): Promise<boolean> {
  if (typeof process.env.CRON_ENABLED === 'string') {
    return parseBoolLoose(process.env.CRON_ENABLED, true);
  }
  return await getConfigBooleanFromDB('cron_enabled', true);
}

export async function requireCronEnabled(): Promise<void> {
  const ok = await isCronEnabled();
  if (!ok) throw new HttpError(503, 'CRON_DISABLED');
}
