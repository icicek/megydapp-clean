// app/api/_lib/corepoints.ts
import { sql } from '@/app/api/_lib/db';

type Num = number | string | null | undefined;

/* ---------------- Config helpers ---------------- */
export async function getCfgNumber(
  key: string,
  fallback: number,
): Promise<number> {
  try {
    const rows = await sql`
      SELECT value
      FROM admin_config
      WHERE key = ${key}
      LIMIT 1
    `;
    const v = rows?.[0]?.value;
    // bazı ortamlarda value JSON ya da string olabilir
    const raw = typeof v === 'object' && v !== null ? (v as any).value : v;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/* ---------------- Weight bundle ---------------- */
export async function getCorepointWeights() {
  const [
    usdPer1,
    deadFirst,
    shareTw,
    shareOther,
    refSign,
    mUsd,
    mShare,
    mDead,
    mRef,
  ] = await Promise.all([
    getCfgNumber('cp_usd_per_1', 100),
    getCfgNumber('cp_deadcoin_first', 100),
    getCfgNumber('cp_share_twitter', 30),
    getCfgNumber('cp_share_other', 10),
    getCfgNumber('cp_referral_signup', 100),
    getCfgNumber('cp_mult_usd', 1.0),
    getCfgNumber('cp_mult_share', 1.0),
    getCfgNumber('cp_mult_deadcoin', 1.0),
    getCfgNumber('cp_mult_referral', 1.0),
  ]);

  return {
    usdPer1,
    deadFirst,
    shareTw,
    shareOther,
    refSign,
    mUsd,
    mShare,
    mDead,
    mRef,
  };
}

/* ---------------- Awarders ---------------- */

export async function awardUsdPoints({
  wallet,
  usdValue,
  txId,
}: {
  wallet: string;
  usdValue: Num;
  txId: string;
}) {
  const { usdPer1, mUsd } = await getCorepointWeights();
  const usd = Number(usdValue ?? 0);
  const pts = Math.max(0, Math.floor(usd * usdPer1 * mUsd));
  if (pts <= 0) return { awarded: 0 };

  // ❗ Aynı tx_id için ikinci kez yazmamak için idempotent insert
  await sql/* sql */ `
    INSERT INTO corepoint_events (wallet_address, type, points, value, tx_id)
    SELECT ${wallet}, 'usd', ${pts}, ${usd}, ${txId}
    WHERE NOT EXISTS (
      SELECT 1
      FROM corepoint_events
      WHERE wallet_address = ${wallet}
        AND type = 'usd'
        AND tx_id = ${txId}
    )
  `;
  return { awarded: pts };
}

export async function awardDeadcoinFirst({
  wallet,
  tokenContract,
}: {
  wallet: string;
  tokenContract: string;
}) {
  const { deadFirst, mDead } = await getCorepointWeights();
  const pts = Math.floor(deadFirst * mDead);
  if (pts <= 0) return { awarded: 0 };

  // Zaten önce "seen" kontrolü yapıyoruz; ON CONFLICT gerek yok
  await sql/* sql */ `
    INSERT INTO corepoint_events (wallet_address, type, points, token_contract)
    VALUES (${wallet}, 'deadcoin_first', ${pts}, ${tokenContract})
  `;
  return { awarded: pts };
}

export async function awardReferralSignup({
  referrer,
  referee,
}: {
  referrer: string;
  referee: string;
}) {
  const { refSign, mRef } = await getCorepointWeights();
  const pts = Math.floor(refSign * mRef);
  if (pts <= 0) return { awarded: 0 };

  await sql/* sql */ `
    INSERT INTO corepoint_events (wallet_address, type, points, ref_wallet)
    SELECT ${referrer}, 'referral_signup', ${pts}, ${referee}
    WHERE NOT EXISTS (
      SELECT 1
      FROM corepoint_events
      WHERE wallet_address = ${referrer}
        AND type = 'referral_signup'
        AND ref_wallet = ${referee}
    )
  `;
  return { awarded: pts };
}

/**
 * Share CorePoint ödülü
 *
 * Kurallar:
 *  - txId VARSA  (success / contribution):
 *      • Aynı (wallet, tx_id, kanal-grubu) için sadece 1 kez CP
 *      • Kanal grubu:
 *          twitter → 1
 *          copy    → 2
 *          diğer   → 3
 *
 *  - txId YOKSA (global paylaşımlar: leaderboard, profile, pvc vs.)
 *      • copy:  cüzdan başına sadece 1 kere
 *      • diğer kanallar: (wallet, context) başına 1 kere
 */
export async function awardShare({
  wallet,
  channel,
  context,
  day,
  txId,
}: {
  wallet: string;
  channel:
    | 'twitter'
    | 'telegram'
    | 'whatsapp'
    | 'email'
    | 'copy'
    | 'instagram'
    | 'tiktok'
    | 'discord'
    | 'system';
  context: string;
  day?: string; // opsiyonel: verilmezse bugün
  txId?: string | null;
}) {
  const { shareTw, shareOther, mShare } = await getCorepointWeights();
  const base = channel === 'twitter' ? shareTw : shareOther;
  const pts = Math.floor(base * mShare);
  if (pts <= 0) return { awarded: 0 };

  const dayStr =
    typeof day === 'string' && day.length >= 10
      ? day.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  // Kanal grubunu value alanında saklayacağız:
  // 1 = twitter, 2 = copy, 3 = diğer
  const group =
    channel === 'twitter' ? 1 : channel === 'copy' ? 2 : 3;

  // ---------------- TX-BASED MODE ----------------
  if (txId) {
    // Aynı (wallet, type='share', tx_id, value=group) zaten varsa puan verme
    await sql/* sql */ `
      INSERT INTO corepoint_events (wallet_address, type, points, context, day, value, tx_id)
      SELECT ${wallet}, 'share', ${pts}, ${context}, ${dayStr}, ${group}, ${txId}
      WHERE NOT EXISTS (
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type          = 'share'
          AND tx_id         = ${txId}
          AND value         = ${group}
      )
    `;
    return { awarded: pts };
  }

  // ---------------- GLOBAL MODE (txId yok) ----------------

  if (channel === 'copy') {
    // copy: cüzdan başına sadece 1 kere (tx_id IS NULL, value=2)
    await sql/* sql */ `
      INSERT INTO corepoint_events (wallet_address, type, points, context, day, value, tx_id)
      SELECT ${wallet}, 'share', ${pts}, ${context}, ${dayStr}, 2, NULL
      WHERE NOT EXISTS (
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type          = 'share'
          AND tx_id IS NULL
          AND value         = 2
      )
    `;
  } else {
    // Diğer kanallar: (wallet, context) başına 1 kere (tx_id IS NULL)
    await sql/* sql */ `
      INSERT INTO corepoint_events (wallet_address, type, points, context, day, value, tx_id)
      SELECT ${wallet}, 'share', ${pts}, ${context}, ${dayStr}, ${group}, NULL
      WHERE NOT EXISTS (
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type          = 'share'
          AND tx_id IS NULL
          AND context       = ${context}
      )
    `;
  }

  return { awarded: pts };
}

/* ---------------- Aggregation ---------------- */
export async function totalCorePoints(wallet: string): Promise<number> {
  const rows = await sql/* sql */ `
    SELECT COALESCE(SUM(points), 0)::int AS t
    FROM corepoint_events
    WHERE wallet_address = ${wallet}
  `;
  return Number(rows?.[0]?.t ?? 0);
}

// ---------------------------------------------------------------------------
// CorePoint: USD + Deadcoin (admin_config tabanlı, corepoint_events’e yazar)
// ---------------------------------------------------------------------------

export async function awardUsdCorepoints(opts: {
  wallet: string;
  usdValue: number;
  isDeadcoin: boolean;
  tokenContract?: string | null;
  txId?: string | null;
}) {
  const wallet = opts.wallet;
  const usdValue = Number(opts.usdValue) || 0;
  const tokenContract = opts.tokenContract ?? null;
  const txId = opts.txId ?? null;

  // Ağırlıkları tek yerden okuyalım
  const { usdPer1, mUsd, deadFirst, mDead } =
    await getCorepointWeights();

  // 1) USD katkısı → type = 'usd'
  if (usdValue > 0) {
    const base = usdValue * usdPer1;
    const points = Math.max(0, Math.floor(base * mUsd));

    if (points > 0) {
      await sql/* sql */ `
        INSERT INTO corepoint_events
          (wallet_address, type, points, value, token_contract, tx_id)
        VALUES
          (${wallet}, 'usd', ${points}, ${usdValue}, ${tokenContract}, ${txId})
      `;
    }
  }

  // 2) Deadcoin bonusu (ilk kez ise) → type = 'deadcoin_first'
  if (opts.isDeadcoin && tokenContract) {
    const seen = (await sql/* sql */ `
      SELECT 1
      FROM corepoint_events
      WHERE wallet_address = ${wallet}
        AND type           = 'deadcoin_first'
        AND token_contract = ${tokenContract}
      LIMIT 1
    `) as unknown as any[];

    const already = seen.length > 0;
    if (!already) {
      const base = deadFirst;
      const points = Math.max(0, Math.floor(base * mDead));

      if (points > 0) {
        await sql/* sql */ `
          INSERT INTO corepoint_events
            (wallet_address, type, points, value, token_contract, tx_id)
          VALUES
            (${wallet}, 'deadcoin_first', ${points}, ${usdValue}, ${tokenContract}, ${txId})
        `;
      }
    }
  }
}
