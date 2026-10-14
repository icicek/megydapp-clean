// app/api/_lib/referral-entitlements.ts

/**
 * Processes persisted referral entitlements.
 *
 * A referral entitlement is created in the same transaction
 * as a newly created Identity.
 *
 * Reward processing must be idempotent and retryable.
 */
export type ReferralEntitlementStatus =
  | 'pending'
  | 'awarded'
  | 'ineligible';

export type ReferralEntitlementProcessResult = {
  status: ReferralEntitlementStatus | 'not_found';
  awarded: number;
  reason: string;
};

export async function getStrictReferralPoints(
  client: Client
): Promise<number> {
  const result = await client.query<{
    key: string;
    value: unknown;
  }>(
    `
      SELECT key, value
      FROM admin_config
      WHERE key IN (
        'cp_referral_signup',
        'cp_mult_referral'
      )
    `
  );

  const rows = result.rows;

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
        // Plain numeric strings are handled below.
      }
    } else if (
      raw !== null &&
      typeof raw === 'object' &&
      'value' in raw
    ) {
      raw = (raw as { value?: unknown }).value;
    }

    if (raw === null || raw === undefined || raw === '') {
      throw new Error(`Invalid referral config: ${row.key}`);
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid referral config: ${row.key}`);
    }

    values.set(String(row.key), value);
  }

  const base = values.get('cp_referral_signup');
  const multiplier = values.get('cp_mult_referral');

  if (base === undefined || multiplier === undefined) {
    throw new Error('Missing referral CP configuration.');
  }

  const points = Math.floor(base * multiplier);

  if (
    !Number.isSafeInteger(points) ||
    points < 0 ||
    points > 2147483647
  ) {
    throw new Error(
      'Referral points exceed the valid database integer range.'
    );
  }

  return points;
}

import type { Client } from '@neondatabase/serverless';

export async function resolveReferralScope(
  client: Client,
  walletAddress: string
): Promise<string> {
  const wallet = String(walletAddress || '').trim();

  if (!wallet) {
    throw new Error('Missing referral wallet.');
  }

  const result = await client.query<{
    identity_id: string;
  }>(
    `
      SELECT identity_id
      FROM identity_wallets
      WHERE chain = 'solana'
        AND LOWER(wallet_address) = LOWER($1)
      LIMIT 1
    `,
    [wallet]
  );

  const identityId = result.rows[0]?.identity_id;

  return identityId
    ? `identity:${identityId}`
    : `wallet:${wallet.toLowerCase()}`;
}

export async function processReferralEntitlement(
  client: Client,
  identityId: string
): Promise<ReferralEntitlementProcessResult> {
  const entitlementResult = await client.query<{
    identity_id: string;
    referee_wallet: string;
    referrer_wallet: string;
    referral_code: string | null;
    status: ReferralEntitlementStatus;
  }>(
    `
      SELECT
        identity_id,
        referee_wallet,
        referrer_wallet,
        referral_code,
        status
      FROM referral_entitlements
      WHERE identity_id = $1
      FOR UPDATE
    `,
    [identityId]
  );

  const entitlement = entitlementResult.rows[0];

  if (!entitlement) {
    return {
      status: 'not_found',
      awarded: 0,
      reason: 'no_entitlement',
    };
  }

  if (entitlement.status !== 'pending') {
    return {
      status: entitlement.status,
      awarded: 0,
      reason: 'already_processed',
    };
  }

  const refereeScope = await resolveReferralScope(
    client,
    entitlement.referee_wallet
  );

  if (refereeScope !== `identity:${entitlement.identity_id}`) {
    throw new Error('Referral referee Identity mismatch.');
  }

  const referrerScope = await resolveReferralScope(
    client,
    entitlement.referrer_wallet
  );

  if (
    entitlement.referee_wallet.toLowerCase() ===
    entitlement.referrer_wallet.toLowerCase() ||
    referrerScope === refereeScope
  ) {
    await client.query(
      `
        UPDATE referral_entitlements
        SET status = 'ineligible',
            processed_at = NOW()
        WHERE identity_id = $1
      `,
      [identityId]
    );

    return {
      status: 'ineligible',
      awarded: 0,
      reason: 'self_or_same_identity',
    };
  }

  /*
  * Serialize referral award decisions for the same referee
  * Identity, including decisions involving historical
  * wallet-scoped awards.
  *
  * This advisory lock is released automatically when the
  * surrounding transaction commits or rolls back.
  */
  await client.query(
    `
      SELECT pg_advisory_xact_lock(
        hashtextextended($1, 0)
      )
    `,
    [`coincarnation:referral:referee:${entitlement.identity_id}`]
  );

  const existingAward = await client.query<{
    referrer_wallet: string;
    referrer_scope: string;
    referred_scope: string;
    corepoint_event_id: string | null;
    event_id: string | null;
    event_type: string | null;
    event_wallet: string | null;
  }>(
    `
      SELECT
        a.referrer_wallet,
        a.referrer_scope,
        a.referred_scope,
        a.corepoint_event_id,
        e.id AS event_id,
        e.type AS event_type,
        e.wallet_address AS event_wallet
      FROM referral_identity_awards a
      LEFT JOIN corepoint_events e
        ON e.id = a.corepoint_event_id
      WHERE (
        a.referred_scope = $1
        OR LOWER(a.referred_wallet) = LOWER($2)
        OR EXISTS (
          SELECT 1
          FROM identity_wallets iw
          WHERE iw.identity_id = $3
            AND iw.chain = 'solana'
            AND LOWER(iw.wallet_address) = LOWER(a.referred_wallet)
        )
      )
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT 2
    `,
    [
      refereeScope,
      entitlement.referee_wallet,
      entitlement.identity_id,
    ]
  );

  if (existingAward.rows.length > 1) {
    throw new Error(
      'Multiple historical referral awards require reconciliation.'
    );
  }

  if (existingAward.rows.length > 0) {
    const award = existingAward.rows[0];

    const historicalReferrerScope = await resolveReferralScope(
      client,
      award.referrer_wallet
    );

    if (
      award.referrer_scope.startsWith('identity:') &&
      award.referrer_scope !== referrerScope
    ) {
      throw new Error(
        'Historical referral award belongs to a different referrer Identity.'
      );
    }

    if (
      award.referred_scope.startsWith('identity:') &&
      award.referred_scope !== refereeScope
    ) {
      throw new Error(
        'Historical referral award belongs to a different referee Identity.'
      );
    }

    const sameReferrer =
      award.referrer_wallet.toLowerCase() ===
      entitlement.referrer_wallet.toLowerCase() ||
      (
        referrerScope.startsWith('identity:') &&
        historicalReferrerScope === referrerScope
      );

    if (
      !sameReferrer ||
      !award.event_id ||
      award.event_type !== 'referral_signup' ||
      !award.event_wallet ||
      award.event_wallet.toLowerCase() !==
      award.referrer_wallet.toLowerCase()
    ) {
      throw new Error(
        'Existing referral award requires reconciliation.'
      );
    }

    const historicalEntitlementUpdate = await client.query(
      `
        UPDATE referral_entitlements
        SET status = 'awarded',
            processed_at = NOW()
        WHERE identity_id = $1
          AND status = 'pending'
        RETURNING identity_id
      `,
      [identityId]
    );
    
    if (historicalEntitlementUpdate.rows.length !== 1) {
      throw new Error(
        'Historical referral entitlement update failed; transaction must be rolled back.'
      );
    }

    return {
      status: 'awarded',
      awarded: 0,
      reason: 'previously_awarded',
    };
  }

  const points = await getStrictReferralPoints(client);

  if (points === 0) {
    return {
      status: 'pending',
      awarded: 0,
      reason: 'zero_points',
    };
  }

  const insertedAward = await client.query<{
    id: string;
  }>(
    `
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
          $1, $2, $3, $4, $5, event_id
        FROM reserved_id
        ON CONFLICT DO NOTHING
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
          corepoint_event_id,
          $1,
          'referral_signup',
          $6,
          $3,
          $7
        FROM award_insert
        RETURNING id
      )
      SELECT id FROM event_insert
    `,
    [
      entitlement.referrer_wallet,
      referrerScope,
      entitlement.referee_wallet,
      refereeScope,
      entitlement.referral_code,
      points,
      `referral_scope:${referrerScope}->${refereeScope}`,
    ]
  );

  if (insertedAward.rows.length !== 1) {
    throw new Error(
      'Referral award insertion did not create exactly one CorePoints event; transaction rolled back.'
    );
  }

  const entitlementUpdate = await client.query(
    `
      UPDATE referral_entitlements
      SET status = 'awarded',
          processed_at = NOW()
      WHERE identity_id = $1
        AND status = 'pending'
      RETURNING identity_id
    `,
    [identityId]
  );
  
  if (entitlementUpdate.rows.length !== 1) {
    throw new Error(
      'Referral entitlement update failed; award transaction must be rolled back.'
    );
  }

  return {
    status: 'awarded',
    awarded: points,
    reason: 'awarded',
  };
}

export async function processReferralEntitlementWithTransaction(
  identityId: string
): Promise<ReferralEntitlementProcessResult> {
  const normalizedIdentityId = String(identityId || '').trim();

  if (!normalizedIdentityId) {
    throw new Error('Missing referral entitlement Identity ID.');
  }

  const { Client, neonConfig } =
    await import('@neondatabase/serverless');
  const ws = (await import('ws')).default;
  const { getDatabaseUrl } =
    await import('@/app/api/_lib/database-url');

  neonConfig.webSocketConstructor = ws;

  const client = new Client(getDatabaseUrl());
  await client.connect();

  let transactionFinished = false;

  try {
    await client.query('BEGIN');

    const result = await processReferralEntitlement(
      client,
      normalizedIdentityId
    );

    await client.query('COMMIT');
    transactionFinished = true;

    return result;
  } catch (error) {
    if (!transactionFinished) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[referral-entitlements] rollback failed:',
          rollbackError
        );
      }
    }

    throw error;
  } finally {
    await client.end();
  }
}