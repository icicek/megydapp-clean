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
  const fallback = {
    cp_usd_per_1: 100,
    cp_deadcoin_first: 100,
    cp_share_twitter: 30,
    cp_share_other: 10,
    cp_referral_signup: 100,
    cp_mult_usd: 1.0,
    cp_mult_share: 1.0,
    cp_mult_deadcoin: 1.0,
    cp_mult_referral: 1.0,
  } as const;

  try {
    const rows = (await sql/* sql */`
      SELECT key, value
      FROM admin_config
      WHERE key IN (
        'cp_usd_per_1',
        'cp_deadcoin_first',
        'cp_share_twitter',
        'cp_share_other',
        'cp_referral_signup',
        'cp_mult_usd',
        'cp_mult_share',
        'cp_mult_deadcoin',
        'cp_mult_referral'
      )
    `) as unknown as Array<{
      key: string;
      value: unknown;
    }>;

    const values = new Map<string, number>();

    for (const row of rows) {
      let raw: unknown = row.value;

      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);

          raw =
            parsed &&
            typeof parsed === 'object' &&
            'value' in parsed
              ? (parsed as { value?: unknown }).value
              : parsed;
        } catch {
          // Plain numeric strings such as "100" are handled below.
        }
      } else if (
        typeof raw === 'object' &&
        raw !== null &&
        'value' in raw
      ) {
        raw = (raw as { value?: unknown }).value;
      }

      const n = Number(raw);

      if (Number.isFinite(n)) {
        values.set(String(row.key), n);
      }
    }

    const get = (key: keyof typeof fallback): number =>
      values.get(key) ?? fallback[key];

    return {
      usdPer1: get('cp_usd_per_1'),
      deadFirst: get('cp_deadcoin_first'),
      shareTw: get('cp_share_twitter'),
      shareOther: get('cp_share_other'),
      refSign: get('cp_referral_signup'),
      mUsd: get('cp_mult_usd'),
      mShare: get('cp_mult_share'),
      mDead: get('cp_mult_deadcoin'),
      mRef: get('cp_mult_referral'),
    };
  } catch {
    return {
      usdPer1: fallback.cp_usd_per_1,
      deadFirst: fallback.cp_deadcoin_first,
      shareTw: fallback.cp_share_twitter,
      shareOther: fallback.cp_share_other,
      refSign: fallback.cp_referral_signup,
      mUsd: fallback.cp_mult_usd,
      mShare: fallback.cp_mult_share,
      mDead: fallback.cp_mult_deadcoin,
      mRef: fallback.cp_mult_referral,
    };
  }
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
  const walletAddress = String(wallet || '').trim();
  const transactionId = String(txId || '').trim();

  if (!walletAddress || !transactionId) {
    return { awarded: 0, reason: 'missing_wallet_or_tx' };
  }

  const { usdPer1, mUsd } = await getCorepointWeights();
  const usd = Number(usdValue ?? 0);

  const rawPts = usd * usdPer1 * mUsd;
  const pts = rawPts > 0 ? Math.max(1, Math.floor(rawPts)) : 0;

  if (pts <= 0) {
    return { awarded: 0, reason: 'zero_points' };
  }

  const inserted = (await sql/* sql */`
    INSERT INTO corepoint_events (
      wallet_address,
      type,
      points,
      value,
      tx_id
    )
    VALUES (
      ${walletAddress},
      'usd',
      ${pts},
      ${usd},
      ${transactionId}
    )
    ON CONFLICT (type, tx_id)
      WHERE type = 'usd' AND tx_id IS NOT NULL
      DO NOTHING
    RETURNING id
  `) as unknown as { id: number | string }[];

  if (inserted.length === 0) {
    return {
      awarded: 0,
      reason: 'transaction_already_awarded',
    };
  }

  return {
    awarded: pts,
    reason: 'awarded',
  };
}

// app/api/_lib/corepoints.ts (YENİ HALİ)

export async function awardDeadcoinFirst({
  wallet,
  tokenContract,
  txId,
}: {
  wallet: string;
  tokenContract: string;
  txId?: string | null;
}) {
  const walletAddress = String(wallet || '').trim();
  const contract = String(tokenContract || '').trim();

  if (!walletAddress || !contract) {
    return { awarded: 0, reason: 'missing_wallet_or_token' };
  }

  const { deadFirst, mDead } = await getCorepointWeights();
  const pts = Math.floor(deadFirst * mDead);

  if (pts <= 0) {
    return { awarded: 0, reason: 'zero_points' };
  }

  const identityScope = await getWalletIdentityScope(walletAddress);
  const context = `deadcoin_scope:${identityScope}`;

  const inserted = (await sql/* sql */`
    WITH reserved_id AS (
      SELECT nextval('corepoint_events_id_seq')::bigint AS event_id
    ),
    award_insert AS (
      INSERT INTO deadcoin_identity_awards (
        identity_scope,
        wallet_address,
        token_contract,
        corepoint_event_id
      )
      SELECT
        ${identityScope},
        ${walletAddress},
        ${contract},
        reserved_id.event_id
      FROM reserved_id
      ON CONFLICT (identity_scope, token_contract) DO NOTHING
      RETURNING corepoint_event_id
    ),
    event_insert AS (
      INSERT INTO corepoint_events (
        id,
        wallet_address,
        type,
        points,
        token_contract,
        tx_id,
        context
      )
      SELECT
        award_insert.corepoint_event_id,
        ${walletAddress},
        'deadcoin_first',
        ${pts},
        ${contract},
        ${txId ?? null},
        ${context}
      FROM award_insert
      RETURNING id
    )
    SELECT id
    FROM event_insert
  `) as unknown as { id: number | string }[];

  const corepointEventId =
    inserted.length > 0 ? Number(inserted[0].id) : null;

  if (!corepointEventId) {
    return {
      awarded: 0,
      reason: 'identity_token_already_awarded',
      identityScope,
      tokenContract: contract,
    };
  }

  return {
    awarded: pts,
    reason: 'awarded',
    identityScope,
    tokenContract: contract,
    corepointEventId,
  };
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

export async function getWalletIdentityScope(wallet: string): Promise<string> {
  const w = String(wallet || '').trim();

  if (!w) {
    return 'wallet:unknown';
  }

  try {
    const rows = await sql/* sql */`
      SELECT identity_id
      FROM identity_wallets
      WHERE chain = 'solana'
        AND LOWER(wallet_address) = LOWER(${w})
      LIMIT 1
    ` as unknown as { identity_id: string | null }[];

    const identityId = rows?.[0]?.identity_id ?? null;

    if (identityId) {
      return `identity:${identityId}`;
    }
  } catch (e) {
    console.warn(
      '[corepoints] getWalletIdentityScope failed, using wallet scope:',
      (e as any)?.message || e
    );
  }

  return `wallet:${w.toLowerCase()}`;
}

export async function awardReferralSignupIdentityAware({
  referrer,
  referee,
  referralCode,
}: {
  referrer: string;
  referee: string;
  referralCode?: string | null;
}) {
  const referrerWallet = String(referrer || '').trim();
  const refereeWallet = String(referee || '').trim();

  if (!referrerWallet || !refereeWallet) {
    return { awarded: 0, reason: 'missing_wallet' };
  }

  if (referrerWallet.toLowerCase() === refereeWallet.toLowerCase()) {
    return { awarded: 0, reason: 'self_referral' };
  }

  const { refSign, mRef } = await getCorepointWeights();
  const pts = Math.floor(refSign * mRef);

  if (pts <= 0) {
    return { awarded: 0, reason: 'zero_points' };
  }

  const referrerScope = await getWalletIdentityScope(referrerWallet);
  const referredScope = await getWalletIdentityScope(refereeWallet);

  if (referrerScope === referredScope) {
    return { awarded: 0, reason: 'same_identity' };
  }

  const context = `referral_scope:${referrerScope}->${referredScope}`;

  const inserted = (await sql/* sql */`
    WITH reserved_id AS (
      SELECT nextval('corepoint_events_id_seq')::bigint AS event_id
    ),
    award_insert AS (
      INSERT INTO referral_identity_awards (
        referrer_wallet,
        referrer_scope,
        referred_wallet,
        referred_scope,
        referral_code,
        corepoint_event_id
      )
      SELECT
        ${referrerWallet},
        ${referrerScope},
        ${refereeWallet},
        ${referredScope},
        ${referralCode ?? null},
        reserved_id.event_id
      FROM reserved_id
      ON CONFLICT (referrer_scope, referred_scope) DO NOTHING
      RETURNING corepoint_event_id
    ),
    event_insert AS (
      INSERT INTO corepoint_events (
        id,
        wallet_address,
        type,
        points,
        ref_wallet,
        context
      )
      SELECT
        award_insert.corepoint_event_id,
        ${referrerWallet},
        'referral_signup',
        ${pts},
        ${refereeWallet},
        ${context}
      FROM award_insert
      RETURNING id
    )
    SELECT id
    FROM event_insert
  `) as unknown as { id: number | string }[];

  const corepointEventId =
    inserted.length > 0 ? Number(inserted[0].id) : null;

  if (!corepointEventId) {
    return {
      awarded: 0,
      reason: 'identity_pair_already_awarded',
      referrerScope,
      referredScope,
    };
  }

  return {
    awarded: pts,
    reason: 'awarded',
    referrerScope,
    referredScope,
    corepointEventId,
  };
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
  day?: string;
  txId?: string | null;
}) {
  const walletAddress = String(wallet || '').trim();
  const shareContext = String(context || '').trim();
  const transactionId = txId ? String(txId).trim() : null;

  if (!walletAddress) {
    return { awarded: 0, reason: 'missing_wallet' };
  }

  if (!shareContext) {
    return { awarded: 0, reason: 'missing_context' };
  }

  const { shareTw, shareOther, mShare } = await getCorepointWeights();

  const base = channel === 'twitter' ? shareTw : shareOther;
  const pts = Math.floor(base * mShare);

  if (pts <= 0) {
    return { awarded: 0, reason: 'zero_points' };
  }

  const dayStr =
    typeof day === 'string' && day.length >= 10
      ? day.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  // Coincarnation share reward groups:
  // 1 = X / Twitter
  // 2 = Other channels
  //
  // "Other" includes copy, Telegram, WhatsApp, email,
  // Instagram, TikTok, Discord and other supported non-X channels.
  //
  // For a tx-based Coincarnation share:
  // - X can earn CP once per transaction.
  // - Other can earn CP once per transaction.
  // Repeated shares in the same group do not earn additional CP.
  const group = channel === 'twitter' ? 1 : 2;

  // ---------------- TX-BASED MODE ----------------
  // Business rule:
  // Same (wallet, tx_id, channel-group) can receive Share CP only once.
  if (transactionId) {
    const inserted = (await sql/* sql */`
      INSERT INTO corepoint_events (
        wallet_address,
        type,
        points,
        context,
        day,
        value,
        tx_id
      )
      VALUES (
        ${walletAddress},
        'share',
        ${pts},
        ${shareContext},
        ${dayStr},
        ${group},
        ${transactionId}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `) as unknown as { id: number | string }[];

    if (inserted.length === 0) {
      return {
        awarded: 0,
        reason: 'share_already_awarded',
      };
    }

    return {
      awarded: pts,
      reason: 'awarded',
    };
  }

  // ---------------- GLOBAL COPY MODE ----------------
  // Copy itself is never blocked.
  // Only the global Copy CorePoint reward is limited to once per wallet.
  if (channel === 'copy') {
    const inserted = (await sql/* sql */`
      INSERT INTO corepoint_events (
        wallet_address,
        type,
        points,
        context,
        day,
        value,
        tx_id
      )
      VALUES (
        ${walletAddress},
        'share',
        ${pts},
        ${shareContext},
        ${dayStr},
        2,
        NULL
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `) as unknown as { id: number | string }[];

    if (inserted.length === 0) {
      return {
        awarded: 0,
        reason: 'global_copy_already_awarded',
      };
    }

    return {
      awarded: pts,
      reason: 'awarded',
    };
  }

  // ---------------- GLOBAL CONTEXT MODE ----------------
  // Other channels:
  // Same (wallet, context) can receive Share CP only once.
  const inserted = (await sql/* sql */`
    INSERT INTO corepoint_events (
      wallet_address,
      type,
      points,
      context,
      day,
      value,
      tx_id
    )
    VALUES (
      ${walletAddress},
      'share',
      ${pts},
      ${shareContext},
      ${dayStr},
      ${group},
      NULL
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as unknown as { id: number | string }[];

  if (inserted.length === 0) {
    return {
      awarded: 0,
      reason: 'share_context_already_awarded',
    };
  }

  return {
    awarded: pts,
    reason: 'awarded',
  };
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

export async function reverseContributionCorepoints(opts: {
  wallet: string;
  txId: string;
  tokenContract?: string | null;
  invalidationId: number;
}) {
  const wallet = String(opts.wallet || '').trim();
  const txId = String(opts.txId || '').trim();
  const tokenContract = opts.tokenContract ?? null;
  const invalidationId = Number(opts.invalidationId);

  if (!wallet || !txId || !Number.isFinite(invalidationId) || invalidationId <= 0) {
    return { reversedUsd: 0, reversedDeadcoin: 0 };
  }

  // 1) USD CP reversal
  const usdRows = await sql/* sql */ `
    SELECT COALESCE(SUM(points), 0)::int AS pts
    FROM corepoint_events
    WHERE wallet_address = ${wallet}
      AND type = 'usd'
      AND tx_id = ${txId}
  `;
  const usdPts = Number(usdRows?.[0]?.pts ?? 0);

  if (usdPts > 0) {
    await sql/* sql */ `
      INSERT INTO corepoint_events
        (wallet_address, type, points, tx_id, token_contract, context)
      SELECT
        ${wallet},
        'usd_blacklist_reversal',
        ${-usdPts},
        ${txId},
        ${tokenContract},
        ${`invalidation:${invalidationId}`}
      WHERE NOT EXISTS (
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'usd_blacklist_reversal'
          AND tx_id = ${txId}
          AND context = ${`invalidation:${invalidationId}`}
      )
    `;
  }

  return {
    reversedUsd: usdPts,
    reversedDeadcoin: 0,
  };
}

export async function reverseDeadcoinIdentityAwardsForBlacklist({
  mint,
  changedBy,
  reason,
}: {
  mint: string;
  changedBy?: string | null;
  reason?: string | null;
}) {
  const tokenContract = String(mint || '').trim();

  if (!tokenContract) {
    return {
      reversedCount: 0,
      reversedPoints: 0,
      reason: 'missing_mint',
    };
  }

  const awards = (await sql/* sql */`
    SELECT
      dia.id,
      dia.identity_scope,
      dia.wallet_address,
      dia.token_contract,
      dia.corepoint_event_id,
      COALESCE(cpe.points, 0)::int AS original_points,
      cpe.tx_id
    FROM deadcoin_identity_awards dia
    LEFT JOIN corepoint_events cpe
      ON cpe.id = dia.corepoint_event_id
    WHERE dia.token_contract = ${tokenContract}
  `) as unknown as {
    id: number;
    identity_scope: string;
    wallet_address: string;
    token_contract: string;
    corepoint_event_id: number | null;
    original_points: number;
    tx_id: string | null;
  }[];

  let reversedCount = 0;
  let reversedPoints = 0;

  for (const award of awards) {
    const pts = Math.max(0, Number(award.original_points || 0));
    if (pts <= 0) continue;

    const context = `deadcoin_blacklist:${award.identity_scope}:${tokenContract}`;

    const inserted = (await sql/* sql */`
      INSERT INTO corepoint_events (
        wallet_address,
        type,
        points,
        token_contract,
        tx_id,
        context
      )
      SELECT
        ${award.wallet_address},
        'deadcoin_blacklist_reversal',
        ${-pts},
        ${tokenContract},
        ${award.tx_id ?? null},
        ${context}
      WHERE NOT EXISTS (
        SELECT 1
        FROM corepoint_events
        WHERE type = 'deadcoin_blacklist_reversal'
          AND token_contract = ${tokenContract}
          AND context = ${context}
      )
      RETURNING id
    `) as unknown as { id: number }[];

    if (inserted.length > 0) {
      reversedCount += 1;
      reversedPoints += pts;
    }
  }

  return {
    reversedCount,
    reversedPoints,
    tokenContract,
  };
}