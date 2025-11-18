// app/api/_lib/corepoints.ts
import { sql } from '@/app/api/_lib/db';

type Num = number | string | null | undefined;

/* ---------------- Config helpers ---------------- */
export async function getCfgNumber(key: string, fallback: number): Promise<number> {
  try {
    const rows = await sql`SELECT value FROM admin_config WHERE key = ${key} LIMIT 1`;
    const v = rows?.[0]?.value;
    // bazı ortamlarda value JSON ya da string olabilir
    const raw = typeof v === 'object' && v !== null ? v.value : v;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/* ---------------- Weight bundle ---------------- */
export async function getCorepointWeights() {
  const [
    usdPer1, deadFirst, shareTw, shareOther, refSign,
    mUsd, mShare, mDead, mRef
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
    usdPer1, deadFirst, shareTw, shareOther, refSign,
    mUsd, mShare, mDead, mRef,
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

  await sql/* sql */`
    INSERT INTO corepoint_events (wallet_address, type, points, value, tx_id)
    VALUES (${wallet}, 'usd', ${pts}, ${usd}, ${txId})
    ON CONFLICT ON CONSTRAINT ux_cp_usd_tx DO NOTHING
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

  await sql/* sql */`
    INSERT INTO corepoint_events (wallet_address, type, points, token_contract)
    VALUES (${wallet}, 'deadcoin_first', ${pts}, ${tokenContract})
    ON CONFLICT ON CONSTRAINT ux_cp_deadcoin_first_unique DO NOTHING
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

  await sql/* sql */`
    INSERT INTO corepoint_events (wallet_address, type, points, ref_wallet)
    VALUES (${referrer}, 'referral_signup', ${pts}, ${referee})
    ON CONFLICT ON CONSTRAINT ux_cp_ref_signup DO NOTHING
  `;
  return { awarded: pts };
}

export async function awardShare({
  wallet,
  channel,
  context,
  day,
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
  day: string; // YYYY-MM-DD
}) {
  const { shareTw, shareOther, mShare } = await getCorepointWeights();
  const base = channel === 'twitter' ? shareTw : shareOther;
  const pts = Math.floor(base * mShare);
  if (pts <= 0) return { awarded: 0 };

  await sql/* sql */`
    INSERT INTO corepoint_events (wallet_address, type, points, context, day)
    VALUES (${wallet}, 'share', ${pts}, ${context}, ${day})
  `;
  return { awarded: pts };
}


/* ---------------- Aggregation ---------------- */
export async function totalCorePoints(wallet: string): Promise<number> {
  const rows = await sql/* sql */`
    SELECT COALESCE(SUM(points),0)::int AS t
    FROM corepoint_events
    WHERE wallet_address = ${wallet}
  `;
  return Number(rows?.[0]?.t ?? 0);
}
// ---------------------------------------------------------------------------
// CorePoint config + USD / Deadcoin event writer (admin_config tabanlı)
// ---------------------------------------------------------------------------

async function getCpNumber(key: string, fallback: number): Promise<number> {
    try {
      const rows = (await sql`
        SELECT value FROM admin_config WHERE key = ${key}
      `) as unknown as { value: any }[];
  
      const raw = rows[0]?.value;
  
      const v =
        raw && typeof raw === 'object' && raw !== null && 'value' in (raw as any)
          ? Number((raw as any).value)
          : Number(raw);
  
      return Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }
  
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
  
    // 1) USD katkısı
    if (usdValue > 0) {
      const per1 = await getCpNumber('cp_usd_per_1', 100);
      const mult = await getCpNumber('cp_mult_usd', 1);
  
      const base = usdValue * per1;
      const points = Math.max(0, Math.floor(base * mult));
  
      if (points > 0) {
        await sql`
          INSERT INTO corepoint_events
            (wallet_address, type, points, value, token_contract, tx_id)
          VALUES
            (${wallet}, 'usd', ${points}, ${usdValue}, ${tokenContract}, ${txId})
        `;
      }
    }
  
    // 2) Deadcoin bonusu (ilk kez ise)
    if (opts.isDeadcoin && tokenContract) {
      const seen = (await sql`
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'deadcoin_first'
          AND token_contract = ${tokenContract}
        LIMIT 1
      `) as unknown as any[];
  
      const already = seen.length > 0;
      if (!already) {
        const base = await getCpNumber('cp_deadcoin_first', 100);
        const mult = await getCpNumber('cp_mult_deadcoin', 1);
  
        const points = Math.max(0, Math.floor(base * mult));
  
        if (points > 0) {
          await sql`
            INSERT INTO corepoint_events
              (wallet_address, type, points, value, token_contract, tx_id)
            VALUES
              (${wallet}, 'deadcoin_first', ${points}, ${usdValue}, ${tokenContract}, ${txId})
          `;
        }
      }
    }
  }
  