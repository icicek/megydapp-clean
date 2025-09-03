// app/api/_lib/feature-flags.ts
import { sql } from '@/app/api/_lib/db';

function asBool(v: unknown, def?: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return def ?? false;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return def ?? false;
}

export async function getConfigValue(key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM config WHERE key = ${key} LIMIT 1`;
  return (rows as any[])[0]?.value ?? null;
}

/** App global kill-switch (yoksa default = true) */
export async function requireAppEnabled() {
  // 1) DB config
  const cfg = await getConfigValue('app_enabled');
  // 2) ENV fallback
  const env = cfg ?? process.env.APP_ENABLED ?? process.env.NEXT_PUBLIC_APP_ENABLED;
  // default true: sadece açıkça false ise kapat
  if (env != null && !asBool(env, true)) {
    const err: any = new Error('app_disabled');
    err.status = 503;
    err.code = 'app_disabled';
    throw err;
  }
}

/** Claim switch (yoksa default = false) */
export async function requireClaimOpen() {
  // 1) DB config
  const cfg = await getConfigValue('claim_open');
  // 2) ENV fallback
  const env = cfg ?? process.env.CLAIM_OPEN ?? process.env.NEXT_PUBLIC_CLAIM_OPEN;
  const open = asBool(env, false);
  if (!open) {
    const err: any = new Error('claim_closed');
    err.status = 403;
    err.code = 'claim_closed';
    throw err;
  }
}

/** Havuz miktarı: config > ENV (DISTRIBUTION_POOL / MEGY_TOTAL_DISTRIBUTE) > 0 */
export async function getDistributionPoolNumber(): Promise<number> {
  const cfg = await getConfigValue('distribution_pool');
  const env =
    cfg ??
    process.env.DISTRIBUTION_POOL ??
    process.env.MEGY_TOTAL_DISTRIBUTE ??
    process.env.NEXT_PUBLIC_DISTRIBUTION_POOL;

  const n = Number(env);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** (Opsiyonel) Admin cüzdanları: config.admin_wallets > ENV */
export async function getAdminWallets(): Promise<string[]> {
  const cfg = await getConfigValue('admin_wallets');
  const env =
    cfg ??
    process.env.ADMIN_WALLETS ??
    process.env.ADMIN_WALLET ??
    process.env.NEXT_PUBLIC_ADMIN_WALLETS;

  if (!env) return [];
  return String(env)
    .split(/[,\s]+/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

export async function isAdminWallet(addr?: string | null): Promise<boolean> {
  if (!addr) return false;
  const list = await getAdminWallets();
  return list.includes(addr.toLowerCase());
}
