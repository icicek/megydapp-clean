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

// -------------------- Effective status (final decision) --------------------

// Girdi tipi (artık daha zengin)
export type EffectiveStatusInput = {
  registryStatus: TokenStatus | null;
  registrySource: string | null; // meta.source / updated_by / reason vs.

  metricsCategory: 'healthy' | 'walking_dead' | 'deadcoin' | null;

  // Fiyat sinyali (0 → mezarlık sinyali)
  usdValue: number;

  // Hacim / likidite (opsiyonel ama tavsiye edilir)
  liquidityUSD?: number | null;
  volumeUSD?: number | null;

  // Admin panelden gelen eşikler (opsiyonel ama varsa kullanırız)
  thresholds?: {
    healthyMinLiq: number;
    healthyMinVol: number;
    walkingDeadMinLiq: number;
    walkingDeadMinVol: number;
  } | null;

  // Kilit bilgileri (deadcoin / list lock)
  locks?: {
    lockDeadcoin: boolean;
    lockList: boolean;
  } | null;
};

export type EffectiveZone = 'healthy' | 'wd_gray' | 'wd_vote' | 'deadzone';

export type EffectiveDecision = {
  status: TokenStatus;   // final: healthy / walking_dead / deadcoin / blacklist / redlist
  zone: EffectiveZone;   // UI & oylama mantığı için
  highLiq: boolean;      // high-liquidity exception uygulandı mı?
  voteEligible: boolean; // deadcoin oylaması açılabilir mi?
};

// küçük helper: sayı normalize
function num(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function computeMetricsZone(
  usdValue: number,
  liq: number | null,
  vol: number | null,
  thresholds?: EffectiveStatusInput['thresholds'],
  metricsCategory?: EffectiveStatusInput['metricsCategory']
): { baseStatus: TokenStatus; zone: EffectiveZone; highLiq: boolean; voteEligible: boolean } {
  const usd = num(usdValue);
  const L = liq ?? 0;
  const V = vol ?? 0;

  const t = thresholds ?? null;

  // Varsayılanlar (thresholds yoksa eski davranış)
  if (!t || (!Number.isFinite(L) && !Number.isFinite(V))) {
    // Eski basit mantık:
    if (usd === 0) {
      return { baseStatus: 'deadcoin', zone: 'deadzone', highLiq: false, voteEligible: false };
    }
    if (metricsCategory === 'deadcoin') {
      return { baseStatus: 'deadcoin', zone: 'deadzone', highLiq: false, voteEligible: false };
    }
    if (metricsCategory === 'walking_dead') {
      return { baseStatus: 'walking_dead', zone: 'wd_gray', highLiq: false, voteEligible: false };
    }
    if (metricsCategory === 'healthy') {
      return { baseStatus: 'healthy', zone: 'healthy', highLiq: false, voteEligible: false };
    }
    // fallback
    return { baseStatus: 'healthy', zone: 'healthy', highLiq: false, voteEligible: false };
  }

  const HLiq = num(t.healthyMinLiq);
  const HVol = num(t.healthyMinVol);
  const WDLiq = num(t.walkingDeadMinLiq);
  const WDVol = num(t.walkingDeadMinVol);

  // 1) DEADZONE: tam mezarlık
  if (usd === 0 || (L < WDLiq && V < WDVol)) {
    return { baseStatus: 'deadcoin', zone: 'deadzone', highLiq: false, voteEligible: false };
  }

  // 2) HEALTHY: en az bir metrik çok iyi
  if (L >= HLiq || V >= HVol) {
    return { baseStatus: 'healthy', zone: 'healthy', highLiq: false, voteEligible: false };
  }

  // 3) WD_GRAY: ikisi de gri bölgede
  const inWDLiqBand = L >= WDLiq && L < HLiq;
  const inWDVolBand = V >= WDVol && V < HVol;

  if (usd > 0 && inWDLiqBand && inWDVolBand) {
    return { baseStatus: 'walking_dead', zone: 'wd_gray', highLiq: false, voteEligible: false };
  }

  // 4) WD_VOTE: biri WD alt sınırının altında, diğeri değil
  const liqBelowWDL = L < WDLiq;
  const volBelowWDV = V < WDVol;
  const deadzoneLike = liqBelowWDL && volBelowWDV;
  const oneSideBroken = liqBelowWDL !== volBelowWDV; // XOR

  if (usd > 0 && !deadzoneLike && oneSideBroken) {
    return { baseStatus: 'walking_dead', zone: 'wd_vote', highLiq: false, voteEligible: true };
  }

  // 5) Hiçbirine girmiyorsa metricsCategory’ye saygılı küçük fallback
  if (metricsCategory === 'deadcoin') {
    return { baseStatus: 'deadcoin', zone: 'deadzone', highLiq: false, voteEligible: false };
  }
  if (metricsCategory === 'walking_dead') {
    return { baseStatus: 'walking_dead', zone: 'wd_gray', highLiq: false, voteEligible: false };
  }
  if (metricsCategory === 'healthy') {
    return { baseStatus: 'healthy', zone: 'healthy', highLiq: false, voteEligible: false };
  }

  return { baseStatus: 'healthy', zone: 'healthy', highLiq: false, voteEligible: false };
}

/**
 * ✅ FINAL DECISION (single source of truth)
 *
 * - Admin / community statülerine mümkün olduğunca saygı duyar.
 * - blacklist / redlist ve kilitli deadcoin → dokunulmaz.
 * - Diğer durumlarda metrics + price + thresholds ile karar verir.
 * - High-liquidity exception: metrics deadcoin dese bile likidite çok yüksekse WD’e çeker.
 */
export function computeEffectiveDecision(input: EffectiveStatusInput): EffectiveDecision {
  const registryStatus = input.registryStatus;
  const registrySource = (input.registrySource || '').toLowerCase();
  const metricsCategory = input.metricsCategory;
  const usd = num(input.usdValue);
  const liq = input.liquidityUSD ?? null;
  const vol = input.volumeUSD ?? null;
  const thresholds = input.thresholds ?? null;
  const locks = input.locks ?? { lockDeadcoin: false, lockList: false };

  const manualSource =
    registrySource === 'admin' || registrySource === 'community';

  // 1) HARD LOCK: blacklist / redlist
  if (
    registryStatus === 'blacklist' ||
    registryStatus === 'redlist' ||
    locks.lockList
  ) {
    const finalStatus: TokenStatus =
      registryStatus === 'blacklist' || registryStatus === 'redlist'
        ? registryStatus
        : 'blacklist';
    return {
      status: finalStatus,
      zone: 'deadzone',
      highLiq: false,
      voteEligible: false,
    };
  }

  // 2) HARD LOCK: deadcoin (admin / community / lock)
  if (
    registryStatus === 'deadcoin' &&
    (locks.lockDeadcoin || manualSource || registryStatus === 'deadcoin')
  ) {
    return {
      status: 'deadcoin',
      zone: 'deadzone',
      highLiq: false,
      voteEligible: false,
    };
  }

  // 3) Metrics tabanlı karar (zone + baseStatus)
  let { baseStatus, zone, highLiq, voteEligible } = computeMetricsZone(
    usd,
    liq,
    vol,
    thresholds,
    metricsCategory,
  );

  // 4) High-liquidity exception:
  //    metricsCategory 'deadcoin' dese bile likidite çok yüksekse direkt mezarlığa atma,
  //    walking_dead statüsüne çek, WD prosedürleri çalışsın.
  if (usd > 0 && metricsCategory === 'deadcoin' && thresholds && liq !== null) {
    const HLiq = num(thresholds.healthyMinLiq);
    const WDVol = num(thresholds.walkingDeadMinVol);
    if (liq >= HLiq) {
      highLiq = true;
      baseStatus = 'walking_dead';
      // hacim çok zayıfsa → oylamaya açılabilir
      if (vol !== null && vol < WDVol) {
        zone = 'wd_vote';
        voteEligible = true;
      } else {
        // aksi halde gri bölge walking_dead
        if (zone === 'deadzone') zone = 'wd_gray';
      }
    }
  }

  // 5) Admin / community manual healthy / WD ise:
  //    status = registryStatus, zone/sinyaller metrics’ten gelsin (UI için).
  if (
    manualSource &&
    (registryStatus === 'healthy' || registryStatus === 'walking_dead')
  ) {
    return {
      status: registryStatus,
      zone,
      highLiq,
      voteEligible,
    };
  }

  // 6) Otomatik statüler arası izin verilen geçişler
  //    (healthy <-> walking_dead, walking_dead -> deadcoin, healthy -> deadcoin)
  let finalStatus: TokenStatus = baseStatus;

  if (registryStatus) {
    if (registryStatus === 'healthy') {
      // healthy → her yöne serbest
      finalStatus = baseStatus;
    } else if (registryStatus === 'walking_dead') {
      // walking_dead → healthy veya deadcoin veya walking_dead (hepsi serbest)
      finalStatus = baseStatus;
    } else if (registryStatus === 'deadcoin') {
      // buraya normalde 2. blokta dönmüş olmamız lazımdı; safety:
      finalStatus = 'deadcoin';
    } else {
      // blacklist/redlist yukarıda ele alındı; burada sadece safety fallback
      finalStatus = baseStatus;
    }
  }

  return {
    status: finalStatus,
    zone,
    highLiq,
    voteEligible,
  };
}

/**
 * Eski imza ile uyumlu resolver:
 *   - Sadece final status döndürür.
 *   - zone / highLiq / voteEligible gibi detaylar için computeEffectiveDecision kullan.
 */
export function resolveEffectiveStatus(input: EffectiveStatusInput): TokenStatus {
  const decision = computeEffectiveDecision(input);
  return decision.status;
}

/**
 * Overload:
 * - getEffectiveStatus(input) -> final decision sadece status (compat)
 * - getEffectiveStatus(mint)  -> registry tabanlı eski davranış (async)
 */
export function getEffectiveStatus(input: EffectiveStatusInput): TokenStatus;
export async function getEffectiveStatus(mint: string): Promise<TokenStatus>;
export function getEffectiveStatus(arg: unknown): TokenStatus | Promise<TokenStatus> {
  // NEW: decision path
  if (typeof arg === 'object' && arg !== null) {
    return resolveEffectiveStatus(arg as EffectiveStatusInput);
  }

  // OLD: compat path (mint -> registry only)
  return (async () => {
    const mint = String(arg || '').trim();
    const row = await getStatusRow(mint);
    if (!row) return 'healthy';
    if (row.status === 'blacklist' || row.status === 'redlist') return row.status;
    // compat: sadece registry status’ü döndürüyoruz (metrics yok)
    return row.status;
  })();
}
