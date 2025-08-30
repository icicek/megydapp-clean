// app/api/_lib/registry.ts
import { sql } from '@/app/api/_lib/db';
import type { TokenStatus } from '@/app/api/_lib/types';
export type { TokenStatus } from '@/app/api/_lib/types';

// Compat: Bazı yerlerde registry üzerinden set/get çağrısı bekleniyor olabilir.
import {
  getStatus as getRegistryStatus,
  setStatus as setRegistryStatus,
} from '@/app/api/_lib/token-registry';
export { getRegistryStatus, setRegistryStatus };

// -------------------- ENV thresholds --------------------
function intFromEnv(name: string, def: number): number {
  const v = Number.parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(v) ? v : def;
}

export const ENV_THRESHOLDS = {
  HEALTHY_MIN_USD: intFromEnv('HEALTHY_MIN_USD', 1000),
  WALKING_DEAD_MIN_USD: intFromEnv('WALKING_DEAD_MIN_USD', 100),
  WALKING_DEAD_MAX_USD: intFromEnv('WALKING_DEAD_MAX_USD', 1000),
  DEADCOIN_MAX_USD: intFromEnv('DEADCOIN_MAX_USD', 100),
};

// -------------------- DB helpers --------------------
export type StatusRow = {
  mint: string;
  status: TokenStatus;
  status_at: string | null;
  updated_by: string | null;
  reason: string | null;
  meta: any;
  created_at: string;
  updated_at: string;
};

/** token_registry’deki satırı ham haliyle döndürür (yoksa null). */
export async function getStatusRow(mint: string): Promise<StatusRow | null> {
  const rows = (await sql`
    SELECT
      mint,
      status::text AS status,
      status_at,
      updated_by,
      reason,
      meta,
      created_at,
      updated_at
    FROM token_registry
    WHERE mint = ${mint}
    LIMIT 1
  `) as unknown as StatusRow[];
  return rows[0] ?? null;
}

// -------------------- ensureFirstSeen (iki imza destekli) --------------------
export type EnsureFirstSeenOptions = {
  /** İlk açılış statüsü (varsayılan: 'healthy') */
  suggestedStatus?: TokenStatus;
  /** Audit için updated_by alanı (varsayılan: 'system:first_seen') */
  actorWallet?: string | null;
  /** Audit reason (varsayılan: 'first_seen') */
  reason?: string | null;
  /** Ek meta (JSON) */
  meta?: any;
};

/**
 * Kayıt yoksa ilk satırı oluşturur (idempotent).
 * 2. parametre geriye dönük uyumlu: string (changedBy) ya da options objesi olabilir.
 * DÖNÜŞ: { created: boolean }
 */
export function ensureFirstSeenRegistry(
  mint: string,
  changedBy?: string
): Promise<{ created: boolean }>;
export function ensureFirstSeenRegistry(
  mint: string,
  options?: EnsureFirstSeenOptions
): Promise<{ created: boolean }>;

export async function ensureFirstSeenRegistry(
  mint: string,
  opts?: string | EnsureFirstSeenOptions
): Promise<{ created: boolean }> {
  // Varsayılanlar
  let status: TokenStatus = 'healthy';
  let updatedBy = 'system:first_seen';
  let reason: string | null = 'first_seen';
  let meta: any = { source: 'ensureFirstSeen' };

  if (typeof opts === 'string') {
    // Eski kullanım (changedBy)
    updatedBy = opts || updatedBy;
  } else if (opts && typeof opts === 'object') {
    if (opts.suggestedStatus) status = opts.suggestedStatus;
    if (opts.actorWallet) updatedBy = opts.actorWallet;
    if (opts.reason !== undefined) reason = opts.reason;
    if (opts.meta) meta = { ...meta, ...opts.meta };
  }

  const rows = (await sql`
    INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
    VALUES (
      ${mint},
      ${status}::token_status_enum,
      NOW(),
      ${updatedBy},
      ${reason},
      ${JSON.stringify(meta)}::jsonb
    )
    ON CONFLICT (mint) DO NOTHING
    RETURNING 1 AS inserted
  `) as unknown as { inserted: 1 }[];

  return { created: !!rows[0]?.inserted };
}

// -------------------- Karar fonksiyonu --------------------
/**
 * Politika:
 * - usdValue === 0  → 'deadcoin' (MEGY yok, CorePoint var)
 * - < $100 vol & liq artık auto-deadcoin DEĞİL → 'walking_dead' + voteSuggested: true
 * - usd >= HEALTHY_MIN_USD → 'healthy'
 * - diğer durumlar → 'walking_dead' (çoğunlukla voteSuggested: true)
 */
export function computeStatusDecision(metrics: {
  usdValue: number;
  volumeUSD?: number | null;
  liquidityUSD?: number | null;
}): { status: TokenStatus; voteSuggested: boolean } {
  const usd = Number(metrics.usdValue) || 0;
  const vol = Number(metrics.volumeUSD ?? 0);
  const liq = Number(metrics.liquidityUSD ?? 0);

  if (usd === 0) {
    return { status: 'deadcoin', voteSuggested: false };
  }

  const criticallyLow =
    vol < ENV_THRESHOLDS.WALKING_DEAD_MIN_USD &&
    liq < ENV_THRESHOLDS.WALKING_DEAD_MIN_USD;

  if (usd >= ENV_THRESHOLDS.HEALTHY_MIN_USD) {
    return { status: 'healthy', voteSuggested: false };
  }

  const suggest = usd < ENV_THRESHOLDS.WALKING_DEAD_MIN_USD || criticallyLow;
  return { status: 'walking_dead', voteSuggested: suggest };
}

// -------------------- Etkili statü --------------------
/**
 * getEffectiveStatus:
 * - redlist/blacklist override’larını korur
 * - (TODO: cross-chain alias yükseltmesi burada değerlendirilebilir)
 */
export async function getEffectiveStatus(mint: string): Promise<TokenStatus> {
  const row = await getStatusRow(mint);
  if (!row) return 'healthy';
  if (row.status === 'blacklist' || row.status === 'redlist') return row.status;
  return row.status;
}
