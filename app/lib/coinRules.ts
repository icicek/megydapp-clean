// app/lib/coinRules.ts

/** UI fetch durumları (ConfirmModal & akışlar) */
export type FetchStatus = 'loading' | 'found' | 'not_found' | 'error';

/** Liste statüleri (registry) */
export type ListStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';

/** Kaynak fiyat formatı */
export interface PriceSource {
  price: number;
  source: string;
}

/**
 * priceSources[0].price * amount ile güvenli USD üretir;
 * usdValue > 0 ise onu kullanır.
 */
export function deriveUsdValue(
  usdValue: number,
  amount: number,
  priceSources: PriceSource[]
): number {
  const unit =
    Array.isArray(priceSources) && priceSources[0]?.price
      ? Number(priceSources[0].price)
      : 0;

  if (Number(usdValue) > 0) return Number(usdValue);

  const amt = Number.isFinite(amount) && amount > 0 ? Number(amount) : 1;
  if (unit > 0) return unit * amt;

  return 0;
}

/**
 * Tek noktadan kural hesaplayıcı:
 * - isHardBlocked: blacklist | redlist → işlem yapılamaz
 * - isDeadcoin: list deadcoin | fetch not_found | (found && derivedUsd==0)
 * - derivedUsd: gösterim ve guard amaçlı efektif USD
 */
export function computeGate(params: {
  listStatus?: ListStatus | null;
  fetchStatus: FetchStatus;
  usdValue: number;
  amount: number;
  priceSources: PriceSource[];
}) {
  const { listStatus, fetchStatus, usdValue, amount, priceSources } = params;

  const derivedUsd = deriveUsdValue(usdValue, amount, priceSources);
  const isHardBlocked =
    listStatus === 'blacklist' || listStatus === 'redlist';
  const isDeadcoin =
    listStatus === 'deadcoin' ||
    fetchStatus === 'not_found' ||
    (fetchStatus === 'found' && derivedUsd === 0);

  return { isHardBlocked, isDeadcoin, derivedUsd };
}

/** Basit izin bayrağı (UI butonları için pratik) */
export function canProceed(params: {
  listStatus?: ListStatus | null;
  fetchStatus: FetchStatus;
  usdValue: number;
  amount: number;
  priceSources: PriceSource[];
}) {
  const { isHardBlocked } = computeGate(params);
  return !isHardBlocked && params.fetchStatus !== 'loading' && params.fetchStatus !== 'error';
}
