// app/api/_lib/registry.ts
import { sql } from '@/app/api/_lib/db';
import type { TokenStatus } from '@/app/api/_lib/types';
export type { TokenStatus } from '@/app/api/_lib/types';

// Compat: Bazı yerlerde registry üzerinden set/get bekleniyor olabilir.
import {
  getStatus as getRegistryStatus,
  setStatus as setRegistryStatus,
} from '@/app/api/_lib/token-registry';
export { getRegistryStatus, setRegistryStatus };

// 🔗 Mint ile sınıflandırma yapabilmek için
import classifyToken from '@/app/api/utils/classifyToken';

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

  // Hacim / likidite için ek (checkTokenLiquidityAndVolume ile uyum)
  HEALTHY_MIN_VOL_USD: intFromEnv('HEALTHY_MIN_VOL_USD', 10_000),
  HEALTHY_MIN_LIQ_USD: intFromEnv('HEALTHY_MIN_LIQ_USD', 10_000),
  WALKING_DEAD_MIN_VOL_USD: intFromEnv('WALKING_DEAD_MIN_VOL_USD', 100),
  WALKING_DEAD_MIN_LIQ_USD: intFromEnv('WALKING_DEAD_MIN_LIQ_USD', 100),
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
  suggestedStatus?: TokenStatus;
  actorWallet?: string | null;
  reason?: string | null;
  meta?: any;
};

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
  let status: TokenStatus = 'healthy';
  let updatedBy = 'system:first_seen';
  let reason: string | null = 'first_seen';
  let meta: any = { source: 'ensureFirstSeen' };

  if (typeof opts === 'string') {
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

// -------------------- Karar fonksiyonu (iki kullanım) --------------------
/**
 * Kullanım A (metrics):
 *   computeStatusDecision({ usdValue, volumeUSD, liquidityUSD })
 *
 * Kullanım B (mint):
 *   computeStatusDecision('<mint>')
 *   → classifyToken çağırır, elde ettiği değerlere göre karar verir.
 */
export function computeStatusDecision(metrics: {
  usdValue: number;
  volumeUSD?: number | null;
  liquidityUSD?: number | null;
}): { status: TokenStatus; voteSuggested: boolean };
export function computeStatusDecision(mint: string): Promise<{ status: TokenStatus; voteSuggested: boolean }>;

export function computeStatusDecision(arg: any): any {
  if (typeof arg === 'string') {
    // Mint verildi → classifyToken ile ölç, sonra bu fonksiyonun metrics mantığına uygula
    return (async () => {
      const cls = await classifyToken({ mint: arg }, 1);
      // classifyToken kategori → TokenStatus eşlemesi
      const cat = cls.category;
      if (cat === 'blacklist' || cat === 'redlist') {
        return { status: cat, voteSuggested: false as const };
      }
      if (cat === 'healthy') {
        return { status: 'healthy' as const, voteSuggested: false as const };
      }
      if (cat === 'walking_dead') {
        // zayıf hacim/likidite varsa oylama öner
        const suggest =
          (cls.volume ?? 0) < ENV_THRESHOLDS.WALKING_DEAD_MIN_VOL_USD ||
          (cls.liquidity ?? 0) < ENV_THRESHOLDS.WALKING_DEAD_MIN_LIQ_USD;
        return { status: 'walking_dead' as const, voteSuggested: suggest };
      }
      // deadcoin/unknown → deadcoin
      return { status: 'deadcoin' as const, voteSuggested: false as const };
    })();
  }

  // Mevcut metrics temelli karar (senkron)
  const metrics = arg as { usdValue: number; volumeUSD?: number | null; liquidityUSD?: number | null };
  const usd = Number(metrics.usdValue) || 0;
  const vol = Number(metrics.volumeUSD ?? 0);
  const liq = Number(metrics.liquidityUSD ?? 0);

  if (usd === 0) {
    return { status: 'deadcoin', voteSuggested: false };
  }
  if (usd >= ENV_THRESHOLDS.HEALTHY_MIN_USD) {
    return { status: 'healthy', voteSuggested: false };
  }

  // DOĞRU: Hacim ve likidite için ilgili *_VOL_* ve *_LIQ_* eşikleri kullanılmalı
  const criticallyLow =
    vol < ENV_THRESHOLDS.WALKING_DEAD_MIN_VOL_USD &&
    liq < ENV_THRESHOLDS.WALKING_DEAD_MIN_LIQ_USD;

  const suggest =
    usd < ENV_THRESHOLDS.WALKING_DEAD_MIN_USD || // değer bazlı “zayıf” sinyali yine geçerli
    criticallyLow;
 
  return { status: 'walking_dead', voteSuggested: suggest };
}

// -------------------- Etkili statü --------------------
export async function getEffectiveStatus(mint: string): Promise<TokenStatus> {
  const row = await getStatusRow(mint);
  if (!row) return 'healthy';
  if (row.status === 'blacklist' || row.status === 'redlist') return row.status;
  return row.status;
}
