// app/api/claim/session/start/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import {
  PublicKey,
  type ParsedInstruction,
} from '@solana/web3.js';

import {
  AccountLayout,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

import {
  Pool,
  neonConfig,
  type PoolClient,
} from '@neondatabase/serverless';

import bs58 from 'bs58';
import ws from 'ws';

import {
  requireIdentityWalletAccess,
} from '@/app/api/_lib/identity-guard';

import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';

import {
  allocateClaimAmountOrThrow,
  getTouchedPhaseIds,
  type ClaimableBucket,
} from '@/app/api/_lib/claim/allocation';

import {
  calculateClaimFeeQuote,
} from '@/app/api/_lib/claim/fee';

neonConfig.webSocketConstructor = ws;

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const BASE_CLAIM_FEE_LAMPORTS = Number(
  process.env.CLAIM_FEE_LAMPORTS ?? 3_000_000
);

const CLAIM_DRY_RUN =
  String(process.env.CLAIM_DRY_RUN ?? '')
    .trim()
    .toLowerCase() === 'true';

/*
 * Server-side claim fee verification must use only the
 * private server environment variable.
 *
 * The browser uses NEXT_PUBLIC_CLAIM_FEE_TREASURY while
 * preparing the fee transfer transaction.
 */
const CLAIM_FEE_TREASURY_RAW =
  process.env.CLAIM_FEE_TREASURY?.trim() ||
  '';

const MAX_TX_AGE_MINUTES = Number(
  process.env.CLAIM_FEE_MAX_TX_AGE_MINUTES ?? 30
);

const FEE_RECOVERY_SIGNATURE =
  process.env.CLAIM_FEE_RECOVERY_SIGNATURE?.trim() ||
  '';

const SESSION_MAX_AGE_MINUTES = Number(
  process.env.CLAIM_SESSION_MAX_AGE_MINUTES ?? 30
);

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ClaimScope = 'wallet' | 'identity';

type Body = {
  wallet_address: string;
  destination: string;

  /**
   * phase_id > 0:
   *   Wallet-scoped claim for one finalized phase.
   *
   * phase_id === 0:
   *   Identity-scoped claim across all linked wallets and finalized phases.
   */
  phase_id?: number;

  claim_scope?: ClaimScope;

  /**
   * Requested MEGY amount.
   *
   * Required so the server can deterministically determine which real phases
   * are touched by an All Phases / identity-scoped partial claim.
   */
  claim_amount?: string | number;

  /**
   * Present only when this request requires a new fee payment.
   */
  fee_tx_signature?: string;

  /**
   * Legacy/client-display field.
   *
   * Never trusted by the server. The authoritative payment amount is derived
   * server-side and verified directly from Solana.
   */
  fee_amount?: number;
};

type SessionResult = {
  id: string | number;
  destination: string;
};

type ClaimPreflightState = {
  feeScope: ClaimFeeScope;

  creditedPhaseIds: number[];

  ataEntitlement:
  ExistingAtaEntitlement | null;

  reusableSession:
  SessionResult | null;

  existingSignaturePayment: {
    id: number;
    identityId: string;
    payerWallet: string;
    destination: string;
    totalPaidLamports: number;
    protocolFeeLamports: number;
    ataCreationLamports: number;
    ataConsumedAt: string | null;
  } | null;
};

type FeeVerificationResult = {
  paidLamports: number;
  blockTime: number;
};

type ClaimFeeScope = {
  requestedBase: bigint;
  touchedPhaseIds: number[];
  buckets: ClaimableBucket[];
};

type ExistingAtaEntitlement = {
  paymentId: number;
  ataCreationLamports: number;
};

type AtaRequirement = {
  ataRequired: boolean;
  ataAddress: string | null;

  /**
   * Solana'nın şu anda bu ATA için istediği gerçek rent-exempt miktar.
   * ATA mevcutsa 0.
   */
  currentCreationLamports: number;

  /**
   * Bu request sırasında kullanıcıdan ayrıca tahsil edilmesi gereken ATA tutarı.
   *
   * Önceden ödenmiş fakat henüz tüketilmemiş bir ATA entitlement varsa 0 olur.
   */
  chargeLamports: number;

  /**
   * Önceden ödenmiş ve bu ATA creation için kullanılabilecek payment.
   */
  entitlementPaymentId: number | null;
};

type ClaimFeeRequirement = {
  touchedPhaseIds: number[];
  creditedPhaseIds: number[];
  feePhaseIds: number[];

  protocolFeeLamports: number;

  ataRequired: boolean;
  ataAddress: string | null;
  ataCreationLamports: number;
  ataChargeLamports: number;
  ataEntitlementPaymentId: number | null;

  requiredLamports: number;
};

type DatabaseErrorLike = {
  message?: unknown;
  code?: unknown;
  constraint?: unknown;
};

/* -------------------------------------------------------------------------- */
/* Basic helpers                                                              */
/* -------------------------------------------------------------------------- */

function json(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, { status });
}

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function toBaseUnits(
  amountLike: string | number,
  decimals: number
): bigint {
  const raw = String(
    amountLike ?? ''
  ).trim();

  if (!raw) {
    throw new Error('BAD_AMOUNT');
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(
      'BAD_AMOUNT_FORMAT'
    );
  }

  const [
    integerPart,
    fractionalPartRaw = '',
  ] = raw.split('.');

  if (
    fractionalPartRaw.length >
    decimals
  ) {
    throw new Error(
      'TOO_MANY_DECIMALS'
    );
  }

  const fractionalPart =
    fractionalPartRaw.padEnd(
      decimals,
      '0'
    );

  const full =
    `${integerPart}${fractionalPart}`
      .replace(/^0+/, '') || '0';

  return BigInt(full);
}

function isValidSolanaSignature(signature: string): boolean {
  try {
    const decoded = bs58.decode(signature);
    return decoded.length === 64;
  } catch {
    return false;
  }
}

function validateConfiguration():
  | {
    ok: true;
    treasury: PublicKey;
    megyMint: PublicKey | null;
    megyDecimals: number;
  }
  | {
    ok: false;
    error: string;
  } {
  if (
    !Number.isSafeInteger(
      BASE_CLAIM_FEE_LAMPORTS
    ) ||
    BASE_CLAIM_FEE_LAMPORTS <= 0
  ) {
    return {
      ok: false,
      error: 'BAD_CLAIM_FEE_CONFIG',
    };
  }

  if (
    !Number.isFinite(MAX_TX_AGE_MINUTES) ||
    MAX_TX_AGE_MINUTES <= 0
  ) {
    return {
      ok: false,
      error:
        'BAD_CLAIM_FEE_MAX_AGE_CONFIG',
    };
  }

  if (
    !Number.isFinite(
      SESSION_MAX_AGE_MINUTES
    ) ||
    SESSION_MAX_AGE_MINUTES <= 0
  ) {
    return {
      ok: false,
      error:
        'BAD_CLAIM_SESSION_MAX_AGE_CONFIG',
    };
  }

  if (!CLAIM_FEE_TREASURY_RAW) {
    return {
      ok: false,
      error:
        'CLAIM_FEE_TREASURY_MISSING',
    };
  }

  const megyDecimals =
    Number(
      process.env.MEGY_DECIMALS ?? 9
    );

  if (
    !Number.isInteger(megyDecimals) ||
    megyDecimals < 0 ||
    megyDecimals > 18
  ) {
    return {
      ok: false,
      error: 'BAD_MEGY_DECIMALS',
    };
  }

  try {
    const treasury =
      new PublicKey(
        CLAIM_FEE_TREASURY_RAW
      );

    const megyMintRaw =
      asString(
        process.env.MEGY_MINT
      );

    let megyMint:
      PublicKey | null = null;

    if (megyMintRaw) {
      megyMint =
        new PublicKey(megyMintRaw);
    } else if (!CLAIM_DRY_RUN) {
      return {
        ok: false,
        error: 'CLAIM_NOT_LIVE',
      };
    }

    return {
      ok: true,
      treasury,
      megyMint,
      megyDecimals,
    };
  } catch {
    return {
      ok: false,
      error:
        'CLAIM_CONFIGURATION_INVALID',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Database helpers                                                           */
/* -------------------------------------------------------------------------- */

function createDbPool(): Pool {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: 1,
  });
}

/**
 * Runs all supplied queries through one PoolClient.
 *
 * This guarantees BEGIN, advisory locks, reads and writes all happen on the
 * same PostgreSQL connection.
 */
async function runTransaction<T>(
  pool: Pool,
  lockKeys: string[],
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const lockKey of lockKeys) {
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext($1)
          )
        `,
        [lockKey]
      );
    }

    const result = await work(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        '[CLAIM_SESSION_START] transaction rollback failed:',
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function resolveClaimFeeScope(
  client: PoolClient,
  params: {
    identityId: string;
    wallet: string;
    phaseId: number;
    claimScope: ClaimScope;
    requestedBase: bigint;
  }
): Promise<ClaimFeeScope> {
  const isAllPhases =
    params.claimScope === 'identity' &&
    params.phaseId === 0;

  let buckets: ClaimableBucket[] = [];

  if (!isAllPhases) {
    const result =
      await client.query(
        `
          WITH snap AS (
            SELECT
              COALESCE(
                SUM(megy_amount_base),
                0
              ) AS snap_base
            FROM claim_snapshots
            WHERE wallet_address = $1
              AND phase_id = $2
          ),
          cl AS (
            SELECT
              COALESCE(
                SUM(claim_amount_base),
                0
              ) AS claimed_base
            FROM claims
            WHERE wallet_address = $1
              AND phase_id = $2
              AND status IN (
                'created',
                'succeeded'
              )
          )
          SELECT
            (
              SELECT snap_base
              FROM snap
            ) AS snap_base,
            (
              SELECT claimed_base
              FROM cl
            ) AS claimed_base,
            p.phase_no,
            p.name AS phase_name
          FROM phases p
          WHERE p.id = $2
          LIMIT 1
        `,
        [
          params.wallet,
          params.phaseId,
        ]
      );

    if (
      !result.rows?.length
    ) {
      throw new Error(
        'PHASE_NOT_FOUND'
      );
    }

    const row =
      result.rows[0];

    const snapBase =
      BigInt(
        String(
          row.snap_base ?? '0'
        )
      );

    const claimedBase =
      BigInt(
        String(
          row.claimed_base ?? '0'
        )
      );

    const claimableBase =
      snapBase > claimedBase
        ? snapBase - claimedBase
        : 0n;

    if (
      claimableBase <= 0n
    ) {
      throw new Error(
        'NO_CLAIMABLE_BALANCE'
      );
    }

    buckets = [
      {
        walletAddress:
          params.wallet,
        phaseId:
          params.phaseId,
        phaseNo:
          row.phase_no == null
            ? null
            : Number(
              row.phase_no
            ),
        phaseName:
          row.phase_name
            ? String(
              row.phase_name
            )
            : null,
        claimableBase,
      },
    ];
  } else {
    const linkedResult =
      await client.query(
        `
          SELECT wallet_address
          FROM identity_wallets
          WHERE identity_id = $1
            AND chain = 'solana'
            AND verified_at IS NOT NULL
          ORDER BY created_at ASC
        `,
        [
          params.identityId,
        ]
      );

    const scopedWallets =
      Array.from(
        new Set(
          (linkedResult.rows ?? [])
            .map(
              (row) =>
                asString(
                  row.wallet_address
                )
            )
            .filter(Boolean)
        )
      );

    if (
      !scopedWallets.some(
        (item) =>
          item.toLowerCase() ===
          params.wallet.toLowerCase()
      )
    ) {
      scopedWallets.push(
        params.wallet
      );
    }

    const result =
      await client.query(
        `
          WITH scoped_wallets AS (
            SELECT
              unnest($1::text[])
                AS wallet_address
          ),
          snaps AS (
            SELECT
              cs.wallet_address,
              cs.phase_id,
              COALESCE(
                SUM(
                  cs.megy_amount_base
                ),
                0
              ) AS snap_base
            FROM claim_snapshots cs
            JOIN scoped_wallets sw
              ON LOWER(
                sw.wallet_address
              ) =
                LOWER(
                  cs.wallet_address
                )
            GROUP BY
              cs.wallet_address,
              cs.phase_id
          ),
          cls AS (
            SELECT
              c.wallet_address,
              c.phase_id,
              COALESCE(
                SUM(
                  c.claim_amount_base
                ),
                0
              ) AS claimed_base
            FROM claims c
            JOIN scoped_wallets sw
              ON LOWER(
                sw.wallet_address
              ) =
                LOWER(
                  c.wallet_address
                )
            WHERE c.status IN (
              'created',
              'succeeded'
            )
            GROUP BY
              c.wallet_address,
              c.phase_id
          )
          SELECT
            s.wallet_address,
            s.phase_id,
            p.phase_no,
            p.name AS phase_name,
            (
              s.snap_base -
              COALESCE(
                c.claimed_base,
                0
              )
            ) AS remaining_base
          FROM snaps s
          LEFT JOIN cls c
            ON LOWER(
              c.wallet_address
            ) =
              LOWER(
                s.wallet_address
              )
            AND c.phase_id =
              s.phase_id
          JOIN phases p
            ON p.id =
              s.phase_id
          WHERE (
            s.snap_base -
            COALESCE(
              c.claimed_base,
              0
            )
          ) > 0
          ORDER BY
            s.phase_id ASC,
            s.wallet_address ASC
        `,
        [
          scopedWallets,
        ]
      );

    buckets =
      (result.rows ?? [])
        .map(
          (row) => ({
            walletAddress:
              asString(
                row.wallet_address
              ),
            phaseId:
              Number(
                row.phase_id
              ),
            phaseNo:
              row.phase_no == null
                ? null
                : Number(
                  row.phase_no
                ),
            phaseName:
              row.phase_name
                ? String(
                  row.phase_name
                )
                : null,
            claimableBase:
              BigInt(
                String(
                  row.remaining_base ??
                  '0'
                )
              ),
          })
        )
        .filter(
          (bucket) =>
            bucket.walletAddress &&
            Number.isInteger(
              bucket.phaseId
            ) &&
            bucket.phaseId > 0 &&
            bucket.claimableBase > 0n
        );

    if (
      buckets.length === 0
    ) {
      throw new Error(
        'NO_CLAIMABLE_BALANCE'
      );
    }
  }

  const allocationResult =
    allocateClaimAmountOrThrow(
      buckets,
      params.requestedBase
    );

  return {
    requestedBase:
      params.requestedBase,
    touchedPhaseIds:
      getTouchedPhaseIds(
        allocationResult.allocations
      ),
    buckets,
  };
}

async function closeExpiredOrConflictingSessions(
  client: PoolClient,
  params: {
    wallet: string;
    destination: string;
    phaseId: number;
  }
): Promise<void> {
  await client.query(
    `
      UPDATE claim_sessions
      SET
        status = 'closed',
        closed_at = now()
      WHERE wallet_address = $1
        AND status = 'open'
        AND (
          opened_at <=
            now() - ($4::text || ' minutes')::interval
          OR phase_id IS DISTINCT FROM $2
          OR destination IS DISTINCT FROM $3
        )
    `,
    [
      params.wallet,
      params.phaseId,
      params.destination,
      SESSION_MAX_AGE_MINUTES,
    ]
  );
}

async function findReusableOpenSession(
  client: PoolClient,
  params: {
    wallet: string;
    destination: string;
    phaseId: number;
  }
): Promise<SessionResult | null> {
  const result = await client.query(
    `
      SELECT
        id,
        destination
      FROM claim_sessions
      WHERE wallet_address = $1
        AND destination = $2
        AND phase_id = $3
        AND status = 'open'
        AND opened_at >
          now() - ($4::text || ' minutes')::interval
      ORDER BY opened_at DESC, id DESC
      LIMIT 1
    `,
    [
      params.wallet,
      params.destination,
      params.phaseId,
      SESSION_MAX_AGE_MINUTES,
    ]
  );

  const row = result.rows?.[0];

  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,
    destination: asString(row.destination),
  };
}

async function getCreditedPhaseIds(
  client: PoolClient,
  params: {
    identityId: string;
    destination: string;
    phaseIds: readonly number[];
  }
): Promise<number[]> {
  const uniquePhaseIds =
    Array.from(
      new Set(
        params.phaseIds.filter(
          (phaseId) =>
            Number.isInteger(phaseId) &&
            phaseId > 0
        )
      )
    );

  if (uniquePhaseIds.length === 0) {
    return [];
  }

  const result =
    await client.query(
      `
        SELECT phase_id
        FROM claim_fee_credits
        WHERE identity_id = $1
          AND destination = $2
          AND phase_id = ANY($3::bigint[])
      `,
      [
        params.identityId,
        params.destination,
        uniquePhaseIds,
      ]
    );

  return Array.from(
    new Set(
      (result.rows ?? [])
        .map(
          (row) =>
            Number(row.phase_id)
        )
        .filter(
          (phaseId) =>
            Number.isInteger(
              phaseId
            ) &&
            phaseId > 0
        )
    )
  );
}

async function getPaymentBySignature(
  client: PoolClient,
  feeTxSignature: string
): Promise<{
  id: number;
  identityId: string;
  payerWallet: string;
  destination: string;
  totalPaidLamports: number;
  protocolFeeLamports: number;
  ataCreationLamports: number;
  ataConsumedAt: string | null;
} | null> {
  const result =
    await client.query(
      `
        SELECT
          id,
          identity_id,
          payer_wallet,
          destination,
          total_paid_lamports,
          protocol_fee_lamports,
          ata_creation_lamports,
          ata_consumed_at
        FROM claim_fee_payments
        WHERE fee_tx_signature = $1
        LIMIT 1
      `,
      [
        feeTxSignature,
      ]
    );

  if (!result.rows?.length) {
    return null;
  }

  const row = result.rows[0];

  const id =
    Number(row.id);

  const totalPaidLamports =
    Number(
      row.total_paid_lamports
    );

  const protocolFeeLamports =
    Number(
      row.protocol_fee_lamports
    );

  const ataCreationLamports =
    Number(
      row.ata_creation_lamports
    );

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(
      totalPaidLamports
    ) ||
    totalPaidLamports < 0 ||
    !Number.isSafeInteger(
      protocolFeeLamports
    ) ||
    protocolFeeLamports < 0 ||
    !Number.isSafeInteger(
      ataCreationLamports
    ) ||
    ataCreationLamports < 0
  ) {
    throw new Error(
      'INVALID_FEE_PAYMENT_ROW'
    );
  }

  return {
    id,
    identityId:
      asString(
        row.identity_id
      ),
    payerWallet:
      asString(
        row.payer_wallet
      ),
    destination:
      asString(
        row.destination
      ),
    totalPaidLamports,
    protocolFeeLamports,
    ataCreationLamports,
    ataConsumedAt:
      row.ata_consumed_at
        ? String(
          row.ata_consumed_at
        )
        : null,
  };
}

async function getUnusedAtaEntitlement(
  client: PoolClient,
  params: {
    identityId: string;
    destination: string;
  }
): Promise<ExistingAtaEntitlement | null> {
  const result =
    await client.query(
      `
        SELECT
          id,
          ata_creation_lamports
        FROM claim_fee_payments
        WHERE identity_id = $1
          AND destination = $2
          AND ata_creation_lamports > 0
          AND ata_consumed_at IS NULL
          AND ata_consumed_tx_signature IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
      [
        params.identityId,
        params.destination,
      ]
    );

  if (!result.rows?.length) {
    return null;
  }

  const row =
    result.rows[0];

  const paymentId =
    Number(row.id);

  const ataCreationLamports =
    Number(
      row.ata_creation_lamports
    );

  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0 ||
    !Number.isSafeInteger(
      ataCreationLamports
    ) ||
    ataCreationLamports <= 0
  ) {
    throw new Error(
      'INVALID_ATA_ENTITLEMENT_ROW'
    );
  }

  return {
    paymentId,
    ataCreationLamports,
  };
}

async function createFeePayment(
  client: PoolClient,
  params: {
    identityId: string;
    payerWallet: string;
    destination: string;
    feeTxSignature: string;
    totalPaidLamports: number;
    protocolFeeLamports: number;
    ataCreationLamports: number;
  }
): Promise<number> {
  const result =
    await client.query(
      `
        INSERT INTO claim_fee_payments (
          identity_id,
          payer_wallet,
          destination,
          fee_tx_signature,
          total_paid_lamports,
          protocol_fee_lamports,
          ata_creation_lamports
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING id
      `,
      [
        params.identityId,
        params.payerWallet,
        params.destination,
        params.feeTxSignature,
        params.totalPaidLamports,
        params.protocolFeeLamports,
        params.ataCreationLamports,
      ]
    );

  const paymentId =
    Number(
      result.rows?.[0]?.id
    );

  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0
  ) {
    throw new Error(
      'FEE_PAYMENT_INSERT_FAILED'
    );
  }

  return paymentId;
}

async function createFeeCredits(
  client: PoolClient,
  params: {
    identityId: string;
    payerWallet: string;
    destination: string;
    phaseIds: readonly number[];
    paymentId: number;
    feeTxSignature: string;
    feePerPhaseLamports: number;
  }
): Promise<void> {
  const uniquePhaseIds =
    Array.from(
      new Set(
        params.phaseIds.filter(
          (phaseId) =>
            Number.isInteger(phaseId) &&
            phaseId > 0
        )
      )
    );

  for (const phaseId of uniquePhaseIds) {
    await client.query(
      `
        INSERT INTO claim_fee_credits (
          identity_id,
          phase_id,
          payer_wallet,
          destination,
          fee_tx_signature,
          fee_amount,
          payment_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        ON CONFLICT (
          identity_id,
          phase_id,
          destination
        )
        DO NOTHING
      `,
      [
        params.identityId,
        phaseId,
        params.payerWallet,
        params.destination,
        params.feeTxSignature,
        params.feePerPhaseLamports,
        params.paymentId,
      ]
    );
  }
}

async function resolveAtaRequirement(
  params: {
    megyMint: PublicKey | null;
    destination: string;
    existingEntitlement:
    ExistingAtaEntitlement | null;
    dryRun: boolean;
  }
): Promise<AtaRequirement> {
  /*
   * Dry-run may intentionally operate without a live MEGY mint.
   * No real ATA creation can occur in that mode.
   */
  if (
    params.dryRun ||
    !params.megyMint
  ) {
    return {
      ataRequired: false,
      ataAddress: null,
      currentCreationLamports: 0,
      chargeLamports: 0,
      entitlementPaymentId: null,
    };
  }

  const destinationOwner =
    new PublicKey(
      params.destination
    );

  const ata =
    await getAssociatedTokenAddress(
      params.megyMint,
      destinationOwner,
      false
    );

  const connection =
    getServerSolanaConnection();

  let ataInfo;

  try {
    ataInfo =
      await connection.getAccountInfo(
        ata,
        'confirmed'
      );
  } catch (error) {
    console.error(
      '[CLAIM_SESSION_START] ATA lookup failed:',
      error
    );

    throw new Error(
      'ATA_LOOKUP_FAILED'
    );
  }

  /*
   * ATA already exists:
   * no creation cost is needed for this claim.
   *
   * If an older unused reimbursement exists, we deliberately do NOT consume
   * it here because Coincarnation has not spent it creating an ATA.
   */
  if (ataInfo) {
    return {
      ataRequired: false,
      ataAddress:
        ata.toBase58(),
      currentCreationLamports: 0,
      chargeLamports: 0,
      entitlementPaymentId: null,
    };
  }

  let currentCreationLamports:
    number;

  try {
    currentCreationLamports =
      await connection
        .getMinimumBalanceForRentExemption(
          AccountLayout.span,
          'confirmed'
        );
  } catch (error) {
    console.error(
      '[CLAIM_SESSION_START] ATA rent lookup failed:',
      error
    );

    throw new Error(
      'ATA_COST_UNAVAILABLE'
    );
  }

  if (
    !Number.isSafeInteger(
      currentCreationLamports
    ) ||
    currentCreationLamports <= 0
  ) {
    throw new Error(
      'BAD_ATA_COST'
    );
  }

  /*
   * The user may already have paid for ATA creation during an older session,
   * while the actual ATA was never created.
   *
   * In that case we must not charge them twice.
   */
  if (
    params.existingEntitlement
  ) {
    return {
      ataRequired: true,
      ataAddress:
        ata.toBase58(),
      currentCreationLamports,
      chargeLamports: 0,
      entitlementPaymentId:
        params.existingEntitlement
          .paymentId,
    };
  }

  return {
    ataRequired: true,
    ataAddress:
      ata.toBase58(),
    currentCreationLamports,
    chargeLamports:
      currentCreationLamports,
    entitlementPaymentId: null,
  };
}

function buildClaimFeeRequirement(
  params: {
    touchedPhaseIds:
    readonly number[];
    creditedPhaseIds:
    readonly number[];
    ataRequirement:
    AtaRequirement;
  }
): ClaimFeeRequirement {
  const calculation =
    calculateClaimFeeQuote({
      touchedPhaseIds:
        params.touchedPhaseIds,

      creditedPhaseIds:
        params.creditedPhaseIds,

      baseFeeLamports:
        BASE_CLAIM_FEE_LAMPORTS,

      /*
       * calculateClaimFeeQuote() receives only the ATA amount that must be
       * charged NOW.
       *
       * If an older unconsumed entitlement exists, this is therefore zero.
       */
      ataCreationLamports:
        params.ataRequirement
          .chargeLamports,
    });

  return {
    touchedPhaseIds:
      calculation.touchedPhaseIds,

    creditedPhaseIds:
      calculation.creditedPhaseIds,

    feePhaseIds:
      calculation.feePhaseIds,

    protocolFeeLamports:
      calculation.protocolFeeLamports,

    ataRequired:
      params.ataRequirement
        .ataRequired,

    ataAddress:
      params.ataRequirement
        .ataAddress,

    ataCreationLamports:
      params.ataRequirement
        .currentCreationLamports,

    ataChargeLamports:
      calculation
        .ataCreationLamports,

    ataEntitlementPaymentId:
      params.ataRequirement
        .entitlementPaymentId,

    requiredLamports:
      calculation.requiredLamports,
  };
}

async function createSession(
  client: PoolClient,
  params: {
    wallet: string;
    destination: string;
    phaseId: number;
    feeSignature?: string | null;
    feeAmount?: number;
    paymentId?: number | null;
  }
): Promise<string | number> {
  const feeSignature =
    params.feeSignature
      ? asString(params.feeSignature)
      : null;

  const feeAmount =
    params.feeAmount ?? 0;

  const paymentId =
    params.paymentId ?? null;

  if (
    !Number.isSafeInteger(feeAmount) ||
    feeAmount < 0
  ) {
    throw new Error(
      'SESSION_FEE_AMOUNT_INVALID'
    );
  }

  if (
    paymentId !== null &&
    (
      !Number.isSafeInteger(paymentId) ||
      paymentId <= 0
    )
  ) {
    throw new Error(
      'SESSION_PAYMENT_ID_INVALID'
    );
  }

  const result =
    await client.query(
      `
        INSERT INTO claim_sessions (
          wallet_address,
          destination,
          phase_id,
          status,
          fee_tx_signature,
          fee_amount,
          payment_id,
          opened_at,
          total_claimed_in_session
        )
        VALUES (
          $1,
          $2,
          $3,
          'open',
          $4,
          $5,
          $6,
          now(),
          0
        )
        RETURNING id
      `,
      [
        params.wallet,
        params.destination,
        params.phaseId,
        feeSignature,
        feeAmount,
        paymentId,
      ]
    );

  const sessionId =
    result.rows?.[0]?.id;

  if (!sessionId) {
    throw new Error(
      'SESSION_CREATE_FAILED'
    );
  }

  return sessionId;
}

async function createSessionFromExistingCredit(
  client: PoolClient,
  params: {
    wallet: string;
    destination: string;
    phaseId: number;
    paymentId?: number | null;
  }
): Promise<string | number> {
  return createSession(
    client,
    {
      wallet:
        params.wallet,
      destination:
        params.destination,
      phaseId:
        params.phaseId,
      feeSignature: null,
      feeAmount: 0,
      paymentId:
        params.paymentId ?? null,
    }
  );
}

async function attachPaymentToSession(
  client: PoolClient,
  params: {
    sessionId: string | number;
    feeSignature?: string | null;
    feeAmount?: number;
    paymentId: number | null;
  }
): Promise<void> {
  const feeSignature =
    params.feeSignature
      ? asString(params.feeSignature)
      : null;

  const feeAmount =
    params.feeAmount ?? 0;

  if (
    !Number.isSafeInteger(feeAmount) ||
    feeAmount < 0
  ) {
    throw new Error(
      'SESSION_FEE_AMOUNT_INVALID'
    );
  }

  await client.query(
    `
      UPDATE claim_sessions
      SET
        fee_tx_signature = $2,
        fee_amount = $3,
        payment_id = $4
      WHERE id = $1
        AND status = 'open'
    `,
    [
      params.sessionId,
      feeSignature,
      feeAmount,
      params.paymentId,
    ]
  );
}

/* -------------------------------------------------------------------------- */
/* Solana fee verification                                                    */
/* -------------------------------------------------------------------------- */

async function verifyFeeTransfer(params: {
  signature: string;
  payer: string;
  treasury: PublicKey;
  expectedLamports: number;
}): Promise<FeeVerificationResult> {
  const connection =
    getServerSolanaConnection();

  let transaction;

  try {
    transaction = await connection.getParsedTransaction(
      params.signature,
      {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }
    );
  } catch (error) {
    console.error(
      '[CLAIM_SESSION_START] fee transaction RPC lookup failed:',
      error
    );

    throw new Error('FEE_RPC_UNAVAILABLE');
  }

  if (!transaction) {
    throw new Error('FEE_TX_NOT_FOUND');
  }

  if (transaction.meta?.err) {
    throw new Error('FEE_TX_FAILED');
  }

  let blockTime = transaction.blockTime;

  if (typeof blockTime !== 'number') {
    try {
      blockTime = await connection.getBlockTime(
        transaction.slot
      );
    } catch (error) {
      console.error(
        '[CLAIM_SESSION_START] fee transaction block-time lookup failed:',
        error
      );
    }
  }

  if (typeof blockTime !== 'number') {
    throw new Error('FEE_TX_TIME_UNAVAILABLE');
  }

  const ageMs = Date.now() - blockTime * 1000;

  // Protect against clearly invalid future timestamps.
  if (ageMs < -2 * 60 * 1000) {
    throw new Error('FEE_TX_TIME_INVALID');
  }

  const isExplicitRecoveryTransaction =
    FEE_RECOVERY_SIGNATURE.length > 0 &&
    params.signature === FEE_RECOVERY_SIGNATURE;

  if (
    ageMs >
    MAX_TX_AGE_MINUTES * 60 * 1000 &&
    !isExplicitRecoveryTransaction
  ) {
    throw new Error('FEE_TX_TOO_OLD');
  }

  const expectedPayer = params.payer;
  const expectedTreasury =
    params.treasury.toBase58();

  let paidLamports = 0;

  const instructions =
    transaction.transaction.message.instructions;

  for (const instruction of instructions) {
    if (!('parsed' in instruction)) {
      continue;
    }

    const parsedInstruction =
      instruction as ParsedInstruction;

    const program =
      parsedInstruction.program;

    const parsed =
      parsedInstruction.parsed;

    if (
      program !== 'system' ||
      typeof parsed !== 'object' ||
      parsed === null ||
      !('type' in parsed) ||
      parsed.type !== 'transfer' ||
      !('info' in parsed)
    ) {
      continue;
    }

    const info =
      parsed.info as Record<string, unknown>;

    const source = asString(
      info.source
    );

    const destination = asString(
      info.destination
    );

    const lamports = Number(
      info.lamports ?? 0
    );

    if (
      source === expectedPayer &&
      destination === expectedTreasury &&
      Number.isSafeInteger(lamports) &&
      lamports > 0
    ) {
      paidLamports += lamports;
    }
  }

  if (paidLamports <= 0) {
    throw new Error(
      'FEE_TRANSFER_NOT_DETECTED'
    );
  }

  if (
    !Number.isSafeInteger(
      params.expectedLamports
    ) ||
    params.expectedLamports <= 0
  ) {
    throw new Error(
      'FEE_EXPECTED_AMOUNT_INVALID'
    );
  }

  if (
    paidLamports <
    params.expectedLamports
  ) {
    throw new Error(
      'FEE_AMOUNT_TOO_LOW'
    );
  }

  return {
    paidLamports,
    blockTime,
  };
}

function feeVerificationStatus(errorCode: string): number {
  if (errorCode === 'FEE_RPC_UNAVAILABLE') {
    return 503;
  }

  if (
    errorCode ===
    'FEE_TX_TIME_UNAVAILABLE' ||
    errorCode ===
    'FEE_TX_TIME_INVALID'
  ) {
    return 503;
  }

  return 400;
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
  req: NextRequest
) {
  let body: Body | null = null;

  try {
    body = (await req
      .json()
      .catch(() => null)) as Body | null;
  } catch {
    body = null;
  }

  if (!body) {
    return json(400, {
      success: false,
      error: 'BAD_JSON',
    });
  }

  const walletRaw = asString(
    body.wallet_address
  );

  const destinationRaw = asString(
    body.destination
  );

  const feeSignature = asString(
    body.fee_tx_signature
  );

  const claimAmountRaw =
    asString(
      body.claim_amount
    );

  const phaseId = Number(
    body.phase_id ?? 0
  );

  const claimScope: ClaimScope =
    body.claim_scope === 'identity'
      ? 'identity'
      : 'wallet';

  const isAllPhases =
    claimScope === 'identity' &&
    phaseId === 0;

  /* ------------------------------------------------------------------------ */
  /* Input validation                                                         */
  /* ------------------------------------------------------------------------ */

  if (
    !walletRaw ||
    !destinationRaw ||
    !claimAmountRaw
  ) {
    return json(400, {
      success: false,
      error: 'MISSING_FIELDS',
    });
  }

  if (
    !Number.isInteger(phaseId) ||
    phaseId < 0
  ) {
    return json(400, {
      success: false,
      error: 'BAD_PHASE_ID',
    });
  }

  if (
    claimScope === 'wallet' &&
    phaseId <= 0
  ) {
    return json(400, {
      success: false,
      error: 'BAD_PHASE_ID',
    });
  }

  if (
    claimScope === 'identity' &&
    phaseId !== 0
  ) {
    return json(400, {
      success: false,
      error:
        'IDENTITY_SCOPE_REQUIRES_PHASE_ZERO',
    });
  }

  let wallet: string;
  let destination: string;

  try {
    wallet =
      new PublicKey(
        walletRaw
      ).toBase58();

    destination =
      new PublicKey(
        destinationRaw
      ).toBase58();
  } catch {
    return json(400, {
      success: false,
      error: 'INVALID_PUBKEY',
    });
  }

  if (
    feeSignature &&
    !isValidSolanaSignature(feeSignature)
  ) {
    return json(400, {
      success: false,
      error: 'BAD_FEE_SIGNATURE',
    });
  }

  const configuration =
    validateConfiguration();

  if (!configuration.ok) {
    return json(503, {
      success: false,
      error: configuration.error,
    });
  }

  let requestedBase: bigint;

  try {
    requestedBase =
      toBaseUnits(
        claimAmountRaw,
        configuration.megyDecimals
      );

    if (requestedBase <= 0n) {
      throw new Error(
        'BAD_AMOUNT'
      );
    }
  } catch (error) {
    const amountError =
      error instanceof Error
        ? error.message
        : 'BAD_AMOUNT';

    if (
      amountError ===
      'TOO_MANY_DECIMALS'
    ) {
      return json(400, {
        success: false,
        error:
          'TOO_MANY_DECIMALS',
      });
    }

    return json(400, {
      success: false,
      error: 'BAD_AMOUNT',
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Identity authorization                                                   */
  /* ------------------------------------------------------------------------ */

  const identityGuard =
    await requireIdentityWalletAccess(
      wallet
    );

  if (!identityGuard.ok) {
    return json(identityGuard.status, {
      success: false,
      error: identityGuard.error,
    });
  }

  const identityId =
    identityGuard.identityId;

  if (!identityId) {
    return json(403, {
      success: false,
      error: 'IDENTITY_REQUIRED',
    });
  }

  const sessionLockKey = [
    'claim-session',
    'identity',
    String(identityId),
    'phase',
    String(phaseId),
  ].join('|');

  const feeSignatureLockKey =
    feeSignature
      ? [
        'claim-fee-signature',
        feeSignature,
      ].join('|')
      : null;

  const lockKeys = feeSignatureLockKey
    ? [
      sessionLockKey,
      feeSignatureLockKey,
    ]
    : [sessionLockKey];

  let pool: Pool | null = null;

  try {
    pool = createDbPool();

    /* ---------------------------------------------------------------------- */
    /* Phase 1: transactional preflight                                       */
    /* ---------------------------------------------------------------------- */

    const preflight =
      await runTransaction<ClaimPreflightState>(
        pool,
        lockKeys,
        async (client) => {
          /*
          * Close only sessions that are expired or conflict with the current
          * wallet + destination + claim-scope phase marker.
          */
          await closeExpiredOrConflictingSessions(
            client,
            {
              wallet,
              destination,
              phaseId,
            }
          );

          /*
          * Determine which REAL phases this exact claim amount touches.
          *
          * For identity / All Phases claims, phaseId === 0 is only the
          * API/session scope marker. Economic fee credits always use the
          * actual phase IDs returned by this helper.
          */
          const feeScope =
            await resolveClaimFeeScope(
              client,
              {
                identityId:
                  String(identityId),
                wallet,
                phaseId,
                claimScope,
                requestedBase,
              }
            );

          /*
          * Fee accounting remains authoritative even in claim dry-run mode.
          *
          * CLAIM_DRY_RUN only suppresses the final MEGY blockchain transfer.
          * Protocol fee credits must always come from persisted DB truth.
          */
          const creditedPhaseIds =
            await getCreditedPhaseIds(
              client,
              {
                identityId:
                  String(identityId),
                destination,
                phaseIds:
                  feeScope.touchedPhaseIds,
              }
            );

          /*
          * ATA reimbursement belongs to Identity + Destination,
          * not to an individual phase.
          */
          const ataEntitlement =
            await getUnusedAtaEntitlement(
              client,
              {
                identityId:
                  String(identityId),
                destination,
              }
            );

          /*
          * An existing open session is only a candidate for reuse.
          *
          * We cannot reuse it yet because this new claim amount may touch
          * additional phases that require new protocol fee credits.
          */
          const reusableSession =
            await findReusableOpenSession(
              client,
              {
                wallet,
                destination,
                phaseId,
              }
            );

          /*
          * If a fee signature was supplied, inspect whether that blockchain
          * payment is already recorded in the authoritative payment ledger.
          *
          * Whether this causes rejection depends on the final required fee,
          * which is calculated after the transaction closes.
          */
          const existingSignaturePayment =
            feeSignature
              ? await getPaymentBySignature(
                client,
                feeSignature
              )
              : null;

          return {
            feeScope,
            creditedPhaseIds,
            ataEntitlement,
            reusableSession,
            existingSignaturePayment,
          };
        }
      );

    let ataRequirement:
      AtaRequirement;

    try {
      ataRequirement =
        await resolveAtaRequirement({
          megyMint:
            configuration.megyMint,
          destination,
          existingEntitlement:
            preflight.ataEntitlement,
          dryRun: false,
        });
    } catch (error) {
      const errorCode =
        error instanceof Error
          ? error.message
          : 'ATA_REQUIREMENT_FAILED';

      console.error(
        '[CLAIM_SESSION_START] ATA requirement failed:',
        {
          error: errorCode,
          wallet,
          destination,
          phaseId,
          claimScope,
        }
      );

      if (
        errorCode ===
        'ATA_LOOKUP_FAILED' ||
        errorCode ===
        'ATA_COST_UNAVAILABLE'
      ) {
        return json(503, {
          success: false,
          error: errorCode,
        });
      }

      return json(500, {
        success: false,
        error:
          errorCode ||
          'ATA_REQUIREMENT_FAILED',
      });
    }

    let feeRequirement:
      ClaimFeeRequirement;

    try {
      feeRequirement =
        buildClaimFeeRequirement({
          touchedPhaseIds:
            preflight
              .feeScope
              .touchedPhaseIds,

          creditedPhaseIds:
            preflight
              .creditedPhaseIds,

          ataRequirement,
        });
    } catch (error) {
      console.error(
        '[CLAIM_SESSION_START] fee requirement calculation failed:',
        error
      );

      return json(500, {
        success: false,
        error:
          'CLAIM_FEE_CALCULATION_FAILED',
      });
    }

    /*
 * --------------------------------------------------------------------------
 * Phase 1 decision:
 * Decide whether this request can proceed without a new blockchain payment.
 * --------------------------------------------------------------------------
 */

    if (
      feeRequirement.requiredLamports === 0
    ) {
      /*
       * No new protocol fee and no new ATA reimbursement are required.
       *
       * Reuse the current open session if possible.
       */
      if (preflight.reusableSession) {
        return json(200, {
          success: true,
          session_id:
            preflight.reusableSession.id,
          reused: true,
          fee_credit_reused: true,
          fee_required: false,
          required_lamports: 0,
          touched_phase_ids:
            feeRequirement.touchedPhaseIds,
          fee_phase_ids:
            feeRequirement.feePhaseIds,
          credited_phase_ids:
            feeRequirement.creditedPhaseIds,
          ata_required:
            feeRequirement.ataRequired,
          ata_creation_lamports:
            feeRequirement.ataCreationLamports,
          ata_charge_lamports:
            feeRequirement.ataChargeLamports,
          claim_scope: claimScope,
          phase_id: phaseId,
          is_all_phases: isAllPhases,
        });
      }

      /*
       * No fee is required, but there is no reusable session.
       *
       * Open a fresh session without inventing a synthetic fee signature.
       * If there is an unused ATA entitlement, keep its payment relationship
       * attached to the new session.
       */
      const sessionId =
        await runTransaction(
          pool,
          [sessionLockKey],
          async (client) => {
            await closeExpiredOrConflictingSessions(
              client,
              {
                wallet,
                destination,
                phaseId,
              }
            );

            /*
             * Another request might have opened a matching session after
             * preflight completed.
             */
            const reusable =
              await findReusableOpenSession(
                client,
                {
                  wallet,
                  destination,
                  phaseId,
                }
              );

            if (reusable) {
              return reusable.id;
            }

            return createSessionFromExistingCredit(
              client,
              {
                wallet,
                destination,
                phaseId,
                paymentId:
                  feeRequirement
                    .ataEntitlementPaymentId,
              }
            );
          }
        );

      return json(200, {
        success: true,
        session_id: sessionId,
        reused: false,
        fee_credit_reused: true,
        fee_required: false,
        required_lamports: 0,
        touched_phase_ids:
          feeRequirement.touchedPhaseIds,
        fee_phase_ids:
          feeRequirement.feePhaseIds,
        credited_phase_ids:
          feeRequirement.creditedPhaseIds,
        ata_required:
          feeRequirement.ataRequired,
        ata_creation_lamports:
          feeRequirement.ataCreationLamports,
        ata_charge_lamports:
          feeRequirement.ataChargeLamports,
        claim_scope: claimScope,
        phase_id: phaseId,
        is_all_phases: isAllPhases,
      });
    }

    /*
     * From this point onward a NEW payment is required.
     */
    if (!feeSignature) {
      return json(400, {
        success: false,
        error:
          'MISSING_FEE_SIGNATURE',
        fee_required: true,
        required_lamports:
          feeRequirement.requiredLamports,
        protocol_fee_lamports:
          feeRequirement.protocolFeeLamports,
        ata_charge_lamports:
          feeRequirement.ataChargeLamports,
        touched_phase_ids:
          feeRequirement.touchedPhaseIds,
        fee_phase_ids:
          feeRequirement.feePhaseIds,
      });
    }

    /*
     * A real payment signature may be used only once.
     *
     * claim_fee_payments is now the authoritative payment ledger.
     */
    if (
      preflight.existingSignaturePayment
    ) {
      return json(409, {
        success: false,
        error:
          'FEE_SIGNATURE_ALREADY_USED',
      });
    }

    /* ---------------------------------------------------------------------- */
    /* Phase 2: verify fee outside DB transaction                             */
    /* ---------------------------------------------------------------------- */

    let verification: FeeVerificationResult;

    try {
      verification =
        await verifyFeeTransfer({
          signature: feeSignature,
          payer: wallet,
          treasury:
            configuration.treasury,
          expectedLamports:
            feeRequirement.requiredLamports,
        });
    } catch (error) {
      const errorCode = asString(
        error instanceof Error
          ? error.message
          : 'FEE_VERIFY_FAILED'
      );

      console.error(
        '[CLAIM_SESSION_START] fee verification failed:',
        {
          error: errorCode,
          wallet,
          phaseId,
          claimScope,
          signature: feeSignature,
          requiredLamports:
            feeRequirement.requiredLamports,
          feePhaseIds:
            feeRequirement.feePhaseIds,
        }
      );

      return json(
        feeVerificationStatus(errorCode),
        {
          success: false,
          error:
            errorCode ||
            'FEE_VERIFY_FAILED',
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Phase 3: atomically record payment, create credits and open session    */
    /* ---------------------------------------------------------------------- */

    const finalResult =
      await runTransaction(
        pool,
        lockKeys,
        async (client) => {
          /*
           * The Solana RPC verification happened outside the DB transaction.
           *
           * Claim balances and fee credits may therefore have changed while
           * verification was in progress. Re-resolve the economic claim scope
           * before writing anything.
           */
          await closeExpiredOrConflictingSessions(
            client,
            {
              wallet,
              destination,
              phaseId,
            }
          );

          const finalFeeScope =
            await resolveClaimFeeScope(
              client,
              {
                identityId:
                  String(identityId),
                wallet,
                phaseId,
                claimScope,
                requestedBase,
              }
            );

          const finalCreditedPhaseIds =
            await getCreditedPhaseIds(
              client,
              {
                identityId:
                  String(identityId),
                destination,
                phaseIds:
                  finalFeeScope.touchedPhaseIds,
              }
            );

          /*
          * If preflight planned to reuse an older ATA reimbursement,
          * verify that entitlement is STILL unused.
          *
          * Another request may have consumed/reserved it while Solana fee
          * verification was running.
          */
          if (
            feeRequirement
              .ataEntitlementPaymentId !== null
          ) {
            const currentAtaEntitlement =
              await getUnusedAtaEntitlement(
                client,
                {
                  identityId:
                    String(identityId),
                  destination,
                }
              );

            if (
              !currentAtaEntitlement ||
              currentAtaEntitlement.paymentId !==
              feeRequirement
                .ataEntitlementPaymentId
            ) {
              throw new Error(
                'FEE_REQUIREMENT_CHANGED'
              );
            }
          }

          /*
           * Recalculate the protocol portion from current DB truth.
           *
           * ATA charge is taken from the server-side requirement already
           * calculated immediately before the blockchain payment.
           */
          const finalFeeCalculation =
            calculateClaimFeeQuote({
              touchedPhaseIds:
                finalFeeScope.touchedPhaseIds,

              creditedPhaseIds:
                finalCreditedPhaseIds,

              baseFeeLamports:
                BASE_CLAIM_FEE_LAMPORTS,

              ataCreationLamports:
                feeRequirement
                  .ataChargeLamports,
            });

          /*
           * A concurrent claim may have changed which phases this amount touches.
           *
           * Never accept the payment if the newly required amount is greater than
           * what was actually paid on-chain.
           */
          if (
            finalFeeCalculation
              .requiredLamports >
            verification.paidLamports
          ) {
            throw new Error(
              'FEE_REQUIREMENT_CHANGED'
            );
          }

          /*
           * The blockchain payment signature must still be unused now.
           *
           * Another request could have recorded it while RPC verification was
           * running.
           */
          const existingPayment =
            await getPaymentBySignature(
              client,
              feeSignature
            );

          if (existingPayment) {
            throw new Error(
              'FEE_SIGNATURE_ALREADY_USED'
            );
          }

          /*
           * One blockchain payment = one payment-ledger record.
           *
           * That single payment may fund multiple phase credits.
           */
          const paymentId =
            await createFeePayment(
              client,
              {
                identityId:
                  String(identityId),

                payerWallet:
                  wallet,

                destination,

                feeTxSignature:
                  feeSignature,

                totalPaidLamports:
                  verification
                    .paidLamports,

                protocolFeeLamports:
                  finalFeeCalculation
                    .protocolFeeLamports,

                /*
                 * Only the ATA amount charged in THIS payment belongs to this
                 * payment record.
                 *
                 * An old unused ATA entitlement is represented by its older
                 * payment instead.
                 */
                ataCreationLamports:
                  feeRequirement
                    .ataChargeLamports,
              }
            );

          /*
           * Create one permanent economic credit for every newly chargeable
           * Identity + Phase + Destination combination.
           */
          await createFeeCredits(
            client,
            {
              identityId:
                String(identityId),

              payerWallet:
                wallet,

              destination,

              phaseIds:
                finalFeeCalculation
                  .feePhaseIds,

              paymentId,

              feeTxSignature:
                feeSignature,

              feePerPhaseLamports:
                BASE_CLAIM_FEE_LAMPORTS,
            }
          );

          /*
           * Which payment must the session carry?
           *
           * If ATA creation is still required and an OLD unused ATA entitlement
           * exists, execution must retain that old payment id so it can mark that
           * reimbursement as consumed when the ATA is actually created.
           *
           * Otherwise the new payment is the relevant payment.
           */
          const usesExistingAtaEntitlement =
            feeRequirement.ataRequired &&
            feeRequirement
              .ataEntitlementPaymentId !== null;

          const sessionPaymentId =
            usesExistingAtaEntitlement
              ? feeRequirement
                .ataEntitlementPaymentId
              : paymentId;

          /*
           * claim_sessions.payment_id should describe the same economic payment
           * represented by its legacy fee metadata.
           *
           * When an older ATA entitlement is carried by the session, the NEW protocol
           * payment remains safely recorded in claim_fee_payments / claim_fee_credits,
           * so it does not need to be duplicated into legacy session fee fields.
           */
          const sessionFeeSignature =
            usesExistingAtaEntitlement
              ? null
              : feeSignature;

          const sessionFeeAmount =
            usesExistingAtaEntitlement
              ? 0
              : verification.paidLamports;
          /*
           * Another request may have opened a matching session during Solana RPC.
           */
          const reusable =
            await findReusableOpenSession(
              client,
              {
                wallet,
                destination,
                phaseId,
              }
            );

          if (reusable) {
            await attachPaymentToSession(
              client,
              {
                sessionId:
                  reusable.id,

                feeSignature:
                  sessionFeeSignature,

                feeAmount:
                  sessionFeeAmount,

                paymentId:
                  sessionPaymentId,
              }
            );

            return {
              sessionId:
                reusable.id,

              reused: true,

              paymentId,

              sessionPaymentId,

              actualPaidLamports:
                verification
                  .paidLamports,

              touchedPhaseIds:
                finalFeeCalculation
                  .touchedPhaseIds,

              feePhaseIds:
                finalFeeCalculation
                  .feePhaseIds,

              creditedPhaseIds:
                finalFeeCalculation
                  .creditedPhaseIds,

              protocolFeeLamports:
                finalFeeCalculation
                  .protocolFeeLamports,

              ataChargeLamports:
                feeRequirement
                  .ataChargeLamports,
            };
          }

          const sessionId =
            await createSession(
              client,
              {
                wallet,
                destination,
                phaseId,

                feeSignature:
                  sessionFeeSignature,

                feeAmount:
                  sessionFeeAmount,

                paymentId:
                  sessionPaymentId,
              }
            );

          return {
            sessionId,

            reused: false,

            paymentId,

            sessionPaymentId,

            actualPaidLamports:
              verification
                .paidLamports,

            touchedPhaseIds:
              finalFeeCalculation
                .touchedPhaseIds,

            feePhaseIds:
              finalFeeCalculation
                .feePhaseIds,

            creditedPhaseIds:
              finalFeeCalculation
                .creditedPhaseIds,

            protocolFeeLamports:
              finalFeeCalculation
                .protocolFeeLamports,

            ataChargeLamports:
              feeRequirement
                .ataChargeLamports,
          };
        }
      );

    return json(200, {
      success: true,

      session_id:
        finalResult.sessionId,

      reused:
        finalResult.reused,

      fee_credit_reused:
        finalResult
          .feePhaseIds
          .length === 0,

      fee_required: true,

      fee_amount:
        finalResult
          .actualPaidLamports,

      payment_id:
        finalResult.paymentId,

      touched_phase_ids:
        finalResult
          .touchedPhaseIds,

      fee_phase_ids:
        finalResult
          .feePhaseIds,

      credited_phase_ids:
        finalResult
          .creditedPhaseIds,

      protocol_fee_lamports:
        finalResult
          .protocolFeeLamports,

      ata_required:
        feeRequirement
          .ataRequired,

      ata_creation_lamports:
        feeRequirement
          .ataCreationLamports,

      ata_charge_lamports:
        finalResult
          .ataChargeLamports,

      required_lamports:
        feeRequirement
          .requiredLamports,

      claim_scope:
        claimScope,

      phase_id:
        phaseId,

      is_all_phases:
        isAllPhases,
    });
  } catch (error: unknown) {
    const dbError: DatabaseErrorLike =
      typeof error === 'object' && error !== null
        ? (error as DatabaseErrorLike)
        : {};

    const errorCode = asString(
      dbError.message || 'DB_ERROR_SESSION_START'
    );

    const postgresCode = asString(
      dbError.code
    );

    const constraintName = asString(
      dbError.constraint
    ).toLowerCase();

    console.error(
      '[CLAIM_SESSION_START] failed:',
      {
        error: errorCode,
        postgresCode,
        constraintName,
        wallet,
        phaseId,
        claimScope,
      }
    );

    if (
      errorCode === 'FEE_SIGNATURE_ALREADY_USED' ||
      constraintName.includes('fee_tx_signature') ||
      constraintName.includes('fee_signature') ||
      constraintName.includes('fee_sig')
    ) {
      return json(409, {
        success: false,
        error: 'FEE_SIGNATURE_ALREADY_USED',
      });
    }

    if (
      postgresCode === '23505' &&
      constraintName.includes('session')
    ) {
      /*
       * An open-session unique constraint may have won a race. Read the
       * winner and safely reuse it.
       */
      if (pool) {
        try {
          const recoveryClient =
            await pool.connect();

          try {
            const reusable =
              await findReusableOpenSession(
                recoveryClient,
                {
                  wallet,
                  destination,
                  phaseId,
                }
              );

            if (reusable) {
              return json(200, {
                success: true,
                session_id: reusable.id,
                reused: true,
                fee_credit_reused: true,
                claim_scope: claimScope,
                phase_id: phaseId,
                is_all_phases:
                  isAllPhases,
              });
            }
          } finally {
            recoveryClient.release();
          }
        } catch (recoveryError) {
          console.error(
            '[CLAIM_SESSION_START] duplicate-session recovery failed:',
            recoveryError
          );
        }
      }

      return json(409, {
        success: false,
        error: 'SESSION_ALREADY_OPEN',
      });
    }

    if (
      errorCode ===
      'PHASE_NOT_FOUND'
    ) {
      return json(404, {
        success: false,
        error: 'PHASE_NOT_FOUND',
      });
    }

    if (
      errorCode ===
      'NO_CLAIMABLE_BALANCE'
    ) {
      return json(409, {
        success: false,
        error: 'NO_CLAIMABLE_BALANCE',
      });
    }

    if (
      errorCode ===
      'CLAIM_AMOUNT_EXCEEDS_AVAILABLE'
    ) {
      return json(409, {
        success: false,
        error:
          isAllPhases
            ? 'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE'
            : 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
      });
    }

    /*
     * Claim/credit state changed while the Solana payment was being verified.
     *
     * Do not turn this into a generic 500. The caller should obtain a fresh
     * quote and retry rather than treating it as a server failure.
     */
    if (
      errorCode ===
      'FEE_REQUIREMENT_CHANGED'
    ) {
      return json(409, {
        success: false,
        error: 'FEE_REQUIREMENT_CHANGED',
        retry_quote: true,
      });
    }

    if (
      errorCode ===
      'INVALID_FEE_PAYMENT_ROW' ||
      errorCode ===
      'INVALID_ATA_ENTITLEMENT_ROW'
    ) {
      return json(500, {
        success: false,
        error: errorCode,
      });
    }

    if (
      errorCode ===
      'FEE_PAYMENT_INSERT_FAILED'
    ) {
      return json(500, {
        success: false,
        error:
          'FEE_PAYMENT_INSERT_FAILED',
      });
    }

    if (
      errorCode ===
      'SESSION_FEE_AMOUNT_INVALID' ||
      errorCode ===
      'SESSION_PAYMENT_ID_INVALID'
    ) {
      return json(500, {
        success: false,
        error: errorCode,
      });
    }

    if (
      errorCode ===
      'SESSION_CREATE_FAILED'
    ) {
      return json(500, {
        success: false,
        error: 'SESSION_CREATE_FAILED',
      });
    }

    if (
      errorCode ===
      'FEE_CREDIT_CREATE_FAILED'
    ) {
      return json(500, {
        success: false,
        error:
          'FEE_CREDIT_CREATE_FAILED',
      });
    }

    if (
      errorCode ===
      'DATABASE_URL_MISSING'
    ) {
      return json(503, {
        success: false,
        error: 'DATABASE_URL_MISSING',
      });
    }

    return json(500, {
      success: false,
      error:
        'DB_ERROR_SESSION_START',
    });
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (poolError) {
        console.error(
          '[CLAIM_SESSION_START] pool shutdown failed:',
          poolError
        );
      }
    }
  }
}