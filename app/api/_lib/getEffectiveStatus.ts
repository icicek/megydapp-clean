// app/api/_lib/getEffectiveStatus.ts

export type TokenStatus =
  | 'healthy'
  | 'walking_dead'
  | 'deadcoin'
  | 'redlist'
  | 'blacklist';

type RegistrySource = 'admin' | 'community' | 'auto' | null;

interface EffectiveStatusInput {
  registryStatus: TokenStatus | null;
  registrySource: RegistrySource;
  metricsCategory: 'healthy' | 'walking_dead' | 'deadcoin' | null;
  usdValue: number;
}

export function getEffectiveStatus({
  registryStatus,
  registrySource,
  metricsCategory,
  usdValue,
}: EffectiveStatusInput): TokenStatus {
  // 0️⃣ USD yoksa her şey biter
  if (usdValue <= 0) {
    return 'deadcoin';
  }

  // 1️⃣ Mutlak bloklar
  if (registryStatus === 'blacklist') return 'blacklist';
  if (registryStatus === 'redlist') return 'redlist';

  // 2️⃣ Admin / community deadcoin = KİLİTLİ
  if (
    registryStatus === 'deadcoin' &&
    (registrySource === 'admin' || registrySource === 'community')
  ) {
    return 'deadcoin';
  }

  // 3️⃣ Otomatik düşüşler (asla yukarı çıkmaz)
  if (metricsCategory === 'deadcoin') {
    return 'deadcoin';
  }

  if (metricsCategory === 'walking_dead') {
    // registry healthy bile olsa düşer
    return 'walking_dead';
  }

  // 4️⃣ Buraya geldiysek sağlıklıdır
  return 'healthy';
}
