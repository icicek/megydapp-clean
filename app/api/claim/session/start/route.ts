// app/api/claim/session/start/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import {
  Connection,
  PublicKey,
  type ParsedInstruction,
} from '@solana/web3.js';

import { NextRequest, NextResponse } from 'next/server';
import {
  Pool,
  neonConfig,
  type PoolClient,
} from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import bs58 from 'bs58';
import ws from 'ws';

import { requireIdentityWalletAccess } from '@/app/api/_lib/identity-guard';

neonConfig.webSocketConstructor = ws;

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const EXPECTED_FEE_LAMPORTS = Number(
  process.env.CLAIM_FEE_LAMPORTS ?? 3_000_000
);

const CLAIM_DRY_RUN =
  String(process.env.CLAIM_DRY_RUN ?? '')
    .trim()
    .toLowerCase() === 'true';

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

const CLAIM_FEE_TREASURY_RAW = String(
  process.env.CLAIM_FEE_TREASURY ??
    process.env.NEXT_PUBLIC_CLAIM_FEE_TREASURY ??
    ''
).trim();

const AMOUNT_TOLERANCE_PCT = Number(
  process.env.CLAIM_FEE_TOLERANCE_PCT ?? 0.02
);

const MAX_TX_AGE_MINUTES = Number(
  process.env.CLAIM_FEE_MAX_TX_AGE_MINUTES ?? 30
);

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
  fee_tx_signature?: string;

  /**
   * Kept for backwards compatibility with ClaimPanel.
   * The server never trusts this value; the actual amount is read from Solana.
   */
  fee_amount?: number;
};

type SessionResult = {
  id: string | number;
  destination: string;
};

type PreflightDecision =
  | {
      type: 'ready';
      sessionId: string | number;
      reused: boolean;
      feeCreditReused: boolean;
    }
  | {
      type: 'fee_required';
    }
  | {
      type: 'verify_fee';
    }
  | {
      type: 'fee_signature_used';
    };

type FeeVerificationResult = {
  paidLamports: number;
  blockTime: number;
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

function isValidSolanaSignature(signature: string): boolean {
  try {
    const decoded = bs58.decode(signature);
    return decoded.length === 64;
  } catch {
    return false;
  }
}

function validateConfiguration():
  | { ok: true; treasury: PublicKey }
  | { ok: false; error: string } {
  if (
    !Number.isSafeInteger(EXPECTED_FEE_LAMPORTS) ||
    EXPECTED_FEE_LAMPORTS <= 0
  ) {
    return {
      ok: false,
      error: 'BAD_CLAIM_FEE_CONFIG',
    };
  }

  if (
    !Number.isFinite(AMOUNT_TOLERANCE_PCT) ||
    AMOUNT_TOLERANCE_PCT < 0 ||
    AMOUNT_TOLERANCE_PCT >= 1
  ) {
    return {
      ok: false,
      error: 'BAD_CLAIM_FEE_TOLERANCE_CONFIG',
    };
  }

  if (
    !Number.isFinite(MAX_TX_AGE_MINUTES) ||
    MAX_TX_AGE_MINUTES <= 0
  ) {
    return {
      ok: false,
      error: 'BAD_CLAIM_FEE_MAX_AGE_CONFIG',
    };
  }

  if (
    !Number.isFinite(SESSION_MAX_AGE_MINUTES) ||
    SESSION_MAX_AGE_MINUTES <= 0
  ) {
    return {
      ok: false,
      error: 'BAD_CLAIM_SESSION_MAX_AGE_CONFIG',
    };
  }

  if (!CLAIM_FEE_TREASURY_RAW) {
    return {
      ok: false,
      error: 'CLAIM_FEE_TREASURY_MISSING',
    };
  }

  try {
    return {
      ok: true,
      treasury: new PublicKey(CLAIM_FEE_TREASURY_RAW),
    };
  } catch {
    return {
      ok: false,
      error: 'CLAIM_FEE_TREASURY_INVALID',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Database helpers                                                           */
/* -------------------------------------------------------------------------- */

function createDbPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL_MISSING');
  }

  return new Pool({
    connectionString,
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

async function hasFeeCredit(
  client: PoolClient,
  params: {
    identityId: string | number;
    phaseId: number;
  }
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT id
      FROM claim_fee_credits
      WHERE identity_id = $1
        AND phase_id = $2
      LIMIT 1
    `,
    [params.identityId, params.phaseId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function isFeeSignatureAlreadyUsed(
  client: PoolClient,
  signature: string
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM (
        SELECT fee_tx_signature
        FROM claim_fee_credits
        WHERE fee_tx_signature = $1

        UNION ALL

        SELECT fee_tx_signature
        FROM claim_sessions
        WHERE fee_tx_signature = $1
      ) used_signatures
      LIMIT 1
    `,
    [signature]
  );

  return (result.rowCount ?? 0) > 0;
}

function createSyntheticFeeSignature(params: {
  identityId: string | number;
  phaseId: number;
  dryRun: boolean;
}): string {
  const prefix = params.dryRun
    ? 'DRY_RUN'
    : 'FEE_CREDIT';

  return [
    prefix,
    String(params.identityId),
    String(params.phaseId),
    Date.now().toString(),
    randomUUID(),
  ].join('_');
}

async function createSession(
  client: PoolClient,
  params: {
    wallet: string;
    destination: string;
    phaseId: number;
    feeSignature: string;
    feeAmount: number;
  }
): Promise<string | number> {
  const result = await client.query(
    `
      INSERT INTO claim_sessions (
        wallet_address,
        destination,
        phase_id,
        status,
        fee_tx_signature,
        fee_amount,
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
        now(),
        0
      )
      RETURNING id
    `,
    [
      params.wallet,
      params.destination,
      params.phaseId,
      params.feeSignature,
      params.feeAmount,
    ]
  );

  const sessionId = result.rows?.[0]?.id;

  if (!sessionId) {
    throw new Error('SESSION_CREATE_FAILED');
  }

  return sessionId;
}

async function createSessionFromExistingCredit(
  client: PoolClient,
  params: {
    identityId: string | number;
    wallet: string;
    destination: string;
    phaseId: number;
    dryRun: boolean;
  }
): Promise<string | number> {
  return createSession(client, {
    wallet: params.wallet,
    destination: params.destination,
    phaseId: params.phaseId,
    feeSignature: createSyntheticFeeSignature({
      identityId: params.identityId,
      phaseId: params.phaseId,
      dryRun: params.dryRun,
    }),
    feeAmount: 0,
  });
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
  const connection = new Connection(
    RPC_URL,
    'confirmed'
  );

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

  if (
    ageMs >
    MAX_TX_AGE_MINUTES * 60 * 1000
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

  const minimumAcceptedLamports =
    Math.floor(
      params.expectedLamports *
        (1 - AMOUNT_TOLERANCE_PCT)
    );

  if (
    paidLamports <
    minimumAcceptedLamports
  ) {
    throw new Error('FEE_AMOUNT_TOO_LOW');
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

  if (!walletRaw || !destinationRaw) {
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

  /* ------------------------------------------------------------------------ */
  /* Claim availability                                                       */
  /* ------------------------------------------------------------------------ */

  const megyMint = asString(
    process.env.MEGY_MINT
  );

  if (!megyMint && !CLAIM_DRY_RUN) {
    return json(503, {
      success: false,
      code: 'CLAIM_NOT_LIVE',
      error: 'CLAIM_NOT_LIVE',
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
      await runTransaction<PreflightDecision>(
        pool,
        lockKeys,
        async (client) => {
          await closeExpiredOrConflictingSessions(
            client,
            {
              wallet,
              destination,
              phaseId,
            }
          );

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
            return {
              type: 'ready',
              sessionId: reusable.id,
              reused: true,
              feeCreditReused: true,
            };
          }

          const creditExists =
            CLAIM_DRY_RUN ||
            (await hasFeeCredit(client, {
              identityId,
              phaseId,
            }));

          if (creditExists) {
            const sessionId =
              await createSessionFromExistingCredit(
                client,
                {
                  identityId,
                  wallet,
                  destination,
                  phaseId,
                  dryRun: CLAIM_DRY_RUN,
                }
              );

            return {
              type: 'ready',
              sessionId,
              reused: false,
              feeCreditReused: true,
            };
          }

          if (!feeSignature) {
            return {
              type: 'fee_required',
            };
          }

          const signatureUsed =
            await isFeeSignatureAlreadyUsed(
              client,
              feeSignature
            );

          if (signatureUsed) {
            return {
              type: 'fee_signature_used',
            };
          }

          return {
            type: 'verify_fee',
          };
        }
      );

    if (preflight.type === 'ready') {
      return json(200, {
        success: true,
        session_id: preflight.sessionId,
        reused: preflight.reused,
        fee_credit_reused:
          preflight.feeCreditReused,
        claim_scope: claimScope,
        phase_id: phaseId,
        is_all_phases: isAllPhases,
      });
    }

    if (
      preflight.type ===
      'fee_required'
    ) {
      return json(400, {
        success: false,
        error: 'MISSING_FEE_SIGNATURE',
      });
    }

    if (
      preflight.type ===
      'fee_signature_used'
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
            EXPECTED_FEE_LAMPORTS,
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
          signature: feeSignature,
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
    /* Phase 3: atomically record fee credit and open session                 */
    /* ---------------------------------------------------------------------- */

    const finalResult =
      await runTransaction(
        pool,
        lockKeys,
        async (client) => {
          /*
           * Another request may have completed while the Solana RPC lookup
           * was running. Everything must therefore be checked again.
           */
          await closeExpiredOrConflictingSessions(
            client,
            {
              wallet,
              destination,
              phaseId,
            }
          );

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
            return {
              sessionId: reusable.id,
              reused: true,
              feeCreditReused: true,
              actualPaidLamports:
                verification.paidLamports,
            };
          }

          const creditAlreadyExists =
            await hasFeeCredit(client, {
              identityId,
              phaseId,
            });

          if (creditAlreadyExists) {
            const sessionId =
              await createSessionFromExistingCredit(
                client,
                {
                  identityId,
                  wallet,
                  destination,
                  phaseId,
                  dryRun: false,
                }
              );

            return {
              sessionId,
              reused: false,
              feeCreditReused: true,
              actualPaidLamports:
                verification.paidLamports,
            };
          }

          const signatureUsed =
            await isFeeSignatureAlreadyUsed(
              client,
              feeSignature
            );

          if (signatureUsed) {
            throw new Error(
              'FEE_SIGNATURE_ALREADY_USED'
            );
          }

          /*
           * claim_fee_credits must have a unique constraint on:
           *
           *   (identity_id, phase_id)
           *
           * ON CONFLICT guarantees a second concurrent request cannot create
           * a second credit for the same identity/phase.
           */
          const creditInsert =
            await client.query(
              `
                INSERT INTO claim_fee_credits (
                  identity_id,
                  phase_id,
                  payer_wallet,
                  destination,
                  fee_tx_signature,
                  fee_amount
                )
                VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6
                )
                ON CONFLICT (
                  identity_id,
                  phase_id
                )
                DO NOTHING
                RETURNING id
              `,
              [
                identityId,
                phaseId,
                wallet,
                destination,
                feeSignature,
                verification.paidLamports,
              ]
            );

          const insertedNewCredit =
            (creditInsert.rowCount ?? 0) === 1;

          /*
           * A zero-row insert means another request or an older endpoint
           * created the credit first. Recheck rather than assuming success.
           */
          if (!insertedNewCredit) {
            const creditNowExists =
              await hasFeeCredit(client, {
                identityId,
                phaseId,
              });

            if (!creditNowExists) {
              throw new Error(
                'FEE_CREDIT_CREATE_FAILED'
              );
            }

            const sessionId =
              await createSessionFromExistingCredit(
                client,
                {
                  identityId,
                  wallet,
                  destination,
                  phaseId,
                  dryRun: false,
                }
              );

            return {
              sessionId,
              reused: false,
              feeCreditReused: true,
              actualPaidLamports:
                verification.paidLamports,
            };
          }

          const sessionId =
            await createSession(client, {
              wallet,
              destination,
              phaseId,
              feeSignature,
              feeAmount:
                verification.paidLamports,
            });

          return {
            sessionId,
            reused: false,
            feeCreditReused: false,
            actualPaidLamports:
              verification.paidLamports,
          };
        }
      );

    return json(200, {
      success: true,
      session_id:
        finalResult.sessionId,
      reused: finalResult.reused,
      fee_credit_reused:
        finalResult.feeCreditReused,
      fee_amount:
        finalResult.actualPaidLamports,
      claim_scope: claimScope,
      phase_id: phaseId,
      is_all_phases: isAllPhases,
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