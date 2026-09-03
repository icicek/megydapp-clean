// app/api/claim/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import bs58 from 'bs58';

import { NextRequest, NextResponse } from 'next/server';
import {
  neon,
  Pool,
  neonConfig,
  type PoolClient,
} from '@neondatabase/serverless';
import ws from 'ws';
import { requireIdentityWalletAccess } from '@/app/api/_lib/identity-guard';
import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';
import {
  allocateClaimAmountOrThrow,
} from '@/app/api/_lib/claim/allocation';
import { createHash, randomUUID } from 'crypto';
import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';

neonConfig.webSocketConstructor = ws;
type DbRow = Record<string, unknown>;

const sql = neon(process.env.DATABASE_URL!);

const SESSION_MAX_AGE_MINUTES = Number(process.env.CLAIM_SESSION_MAX_AGE_MINUTES ?? 30);

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_SESSION_ID_LENGTH = 200;

/*
 * A claim reservation owns execution only for a short period before
 * its Solana transaction signature is persisted.
 *
 * If the process dies before that point, a later request may safely
 * recover the stale reservation after this lease expires.
 */
const CLAIM_EXECUTION_LEASE_SECONDS = 120;

const CLAIM_DRY_RUN =
  String(process.env.CLAIM_DRY_RUN ?? '')
    .trim()
    .toLowerCase() === 'true';

function createDbPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL_MISSING');
  }

  return new Pool({
    connectionString,
  });
}

function createTransactionSql(
  client: PoolClient
) {
  return async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbRow[]> => {
    const queryText = strings.reduce(
      (text, part, index) =>
        text +
        part +
        (
          index < values.length
            ? `$${index + 1}`
            : ''
        ),
      ''
    );

    const result = await client.query(
      queryText,
      values
    );

    return result.rows as DbRow[];
  };
}

function json(
  status: number,
  data: Record<string, unknown>
) {
  return NextResponse.json(data, {
    status,
  });
}

function asStr(value: unknown): string {
  return String(value ?? '').trim();
}

function asDbRow(
  value: unknown
): DbRow {
  return typeof value === 'object' &&
    value !== null
    ? (value as DbRow)
    : {};
}

function loadKeypair(): Keypair {
  const raw = String(process.env.MEGY_TREASURY_SECRET_KEY || '').trim();
  if (!raw) throw new Error('MISSING_TREASURY_SECRET');

  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  const buf = Buffer.from(raw, 'base64');
  return Keypair.fromSecretKey(new Uint8Array(buf));
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function toBaseUnits(amountLike: string | number, decimals: number): bigint {
  const raw = String(amountLike ?? '').trim();
  if (!raw) throw new Error('BAD_AMOUNT');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('BAD_AMOUNT_FORMAT');

  const [iPart, fPartRaw = ''] =
    raw.split('.');

  if (fPartRaw.length > decimals) {
    throw new Error(
      'TOO_MANY_DECIMALS'
    );
  }

  const paddedFrac =
    fPartRaw.padEnd(decimals, '0');
  const full = `${iPart}${paddedFrac}`.replace(/^0+/, '') || '0';
  return BigInt(full);
}

function baseToDecimalString(base: bigint, decimals: number): string {
  const neg = base < 0n;
  const b = neg ? -base : base;

  const s = b.toString();
  if (decimals <= 0) return (neg ? '-' : '') + s;

  const pad = decimals + 1;
  const padded = s.length < pad ? s.padStart(pad, '0') : s;

  const i = padded.slice(0, -decimals);
  let f = padded.slice(-decimals);

  f = f.replace(/0+$/, '');
  const out = f ? `${i}.${f}` : i;
  return (neg ? '-' : '') + out;
}

type ClaimTransactionState =
  | 'succeeded'
  | 'failed'
  | 'pending'
  | 'not_found';

async function getClaimTransactionState(
  signature: string
): Promise<ClaimTransactionState> {
  const connection =
    getServerSolanaConnection();

  const statuses =
    await connection.getSignatureStatuses(
      [signature],
      {
        searchTransactionHistory: true,
      }
    );

  const status = statuses.value[0];

  if (!status) {
    return 'not_found';
  }

  if (status.err) {
    return 'failed';
  }

  if (
    status.confirmationStatus === 'confirmed' ||
    status.confirmationStatus === 'finalized'
  ) {
    return 'succeeded';
  }

  return 'pending';
}

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  phase_id: number; // 0 => all phases
  claim_amount: string | number;
  idempotency_key?: string | null;
};

type Split = {
  wallet_address?: string;
  phase_id: number;
  phase_no?: number | null;
  phase_name?: string | null;
  amount_base: bigint;
  amount_human: string;
  idem_key: string;
};

export async function POST(req: NextRequest) {
  let body: Body | null = null;
  try {
    body = (await req.json().catch(() => null)) as Body | null;
  } catch {
    body = null;
  }
  if (!body) return json(400, { success: false, error: 'BAD_JSON' });

  const sessionId = asStr(body.session_id);

  const walletRaw =
    asStr(body.wallet_address);

  const destinationRaw =
    asStr(body.destination);

  const phaseIdRaw = Number(
    body.phase_id
  );

  const idemKeyRoot =
    asStr(body.idempotency_key ?? '');

  const claimAmountRaw =
    (body.claim_amount ?? '')
      .toString()
      .trim();

  if (
    !sessionId ||
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
    !Number.isInteger(phaseIdRaw) ||
    phaseIdRaw < 0
  ) {
    return json(400, {
      success: false,
      error: 'BAD_PHASE_ID',
    });
  }

  const isAllPhases =
    phaseIdRaw === 0;

  if (!idemKeyRoot) {
    return json(400, {
      success: false,
      error: 'MISSING_IDEMPOTENCY_KEY',
    });
  }

  if (
    idemKeyRoot.length >
    MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    return json(400, {
      success: false,
      error: 'IDEMPOTENCY_KEY_TOO_LONG',
    });
  }

  if (idemKeyRoot.includes('#')) {
    return json(400, {
      success: false,
      error: 'INVALID_IDEMPOTENCY_KEY',
    });
  }

  if (
    sessionId.length >
    MAX_SESSION_ID_LENGTH
  ) {
    return json(400, {
      success: false,
      error: 'SESSION_ID_TOO_LONG',
    });
  }

  let wallet: string;
  let destination: string;

  try {
    wallet =
      new PublicKey(walletRaw)
        .toBase58();

    destination =
      new PublicKey(destinationRaw)
        .toBase58();
  } catch {
    return json(400, {
      success: false,
      error: 'INVALID_PUBKEY',
    });
  }

  const identityGuard =
    await requireIdentityWalletAccess(wallet);

  if (!identityGuard.ok) {
    return json(identityGuard.status, {
      success: false,
      error: identityGuard.error,
    });
  }

  const identityId = identityGuard.identityId;

  let scopedWallets = [wallet];

  if (isAllPhases) {
    const linked = await sql`
      SELECT wallet_address
      FROM identity_wallets
      WHERE identity_id = ${identityId}
        AND chain = 'solana'
        AND verified_at IS NOT NULL
      ORDER BY created_at ASC
    `;

    scopedWallets = Array.from(
      new Set(
        (linked ?? [])
          .map((row: unknown) => {
            const record = asDbRow(row);

            return asStr(
              record.wallet_address
            );
          })
          .filter(Boolean)
      )
    );

    if (!scopedWallets.some((w) => w === wallet)) {
      scopedWallets.push(wallet);
    }
  }

  const MEGY_MINT = asStr(process.env.MEGY_MINT || '');
  if (!MEGY_MINT && !CLAIM_DRY_RUN) {
    return json(503, {
      success: false,
      code: 'CLAIM_NOT_LIVE',
      error: 'CLAIM_NOT_LIVE',
    });
  }

  const MEGY_DECIMALS = Number(
    process.env.MEGY_DECIMALS ?? 9
  );

  if (
    !Number.isInteger(MEGY_DECIMALS) ||
    MEGY_DECIMALS < 0 ||
    MEGY_DECIMALS > 18
  ) {
    return json(500, {
      success: false,
      error: 'BAD_MEGY_DECIMALS',
    });
  }

  let amountBaseTotal: bigint;
  try {
    amountBaseTotal = toBaseUnits(claimAmountRaw, MEGY_DECIMALS);
    const n = Number(claimAmountRaw);
    if (!Number.isFinite(n) || n <= 0) throw new Error('BAD_AMOUNT');
    if (amountBaseTotal <= 0n) throw new Error('BAD_AMOUNT');
  } catch {
    return json(400, { success: false, error: 'BAD_AMOUNT' });
  }

  const requestHashRoot = sha256Hex(
    `v3|${wallet}|${destination}|${isAllPhases ? 'ALL' : String(phaseIdRaw)}|${claimAmountRaw}`
  );

  /*
   * All-phases claims create child idempotency keys in this form:
   *
   *   <root>#<wallet>#<phase>
   *
   * Recovery/deduplication must therefore be tied to the root
   * idempotency key, not merely to request_hash.
   */
  const identityIdempotencyPrefix =
    `${idemKeyRoot}#`;

  /*
  * Every claim belonging to the same identity must serialize through
  * the same advisory lock.
  *
  * This prevents an ALL-phases claim and a single-phase claim from
  * calculating/reserving the same underlying balance concurrently.
  */
  const claimLockKey =
    `claim|identity|${identityId}`;

  const executionToken = randomUUID();

  // --- Idempotency and interrupted-claim recovery ---
  let existingClaim:
    | {
      id: number;
      status: string;
      tx_signature: string | null;
      request_hash: string | null;
      session_id: string | null;
      execution_token: string | null;
      execution_lease_expires_at: Date | null;
      tx_last_valid_block_height: number | null;
    }
    | null = null;

  if (!isAllPhases) {
    if (
      !Number.isInteger(phaseIdRaw) ||
      phaseIdRaw <= 0
    ) {
      return json(400, {
        success: false,
        error: 'BAD_PHASE_ID',
      });
    }

    const existing = await sql`
      SELECT
        id,
        status,
        tx_signature,
        request_hash,
        session_id,
        execution_token,
        execution_lease_expires_at,
        tx_last_valid_block_height
      FROM claims
      WHERE wallet_address = ${wallet}
        AND phase_id = ${phaseIdRaw}
        AND idempotency_key = ${idemKeyRoot}
        AND status IN ('created', 'succeeded')
      ORDER BY id ASC
      LIMIT 1
    `;

    if (existing?.length) {
      const row = existing[0];

      if (
        String(row.request_hash || '') &&
        String(row.request_hash) !==
        requestHashRoot
      ) {
        return json(409, {
          success: false,
          error:
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        });
      }

      existingClaim = {
        id: Number(row.id),
        status: String(row.status || ''),
        tx_signature: row.tx_signature
          ? String(row.tx_signature)
          : null,
        tx_last_valid_block_height:
          row.tx_last_valid_block_height != null
            ? Number(row.tx_last_valid_block_height)
            : null,
        request_hash: row.request_hash
          ? String(row.request_hash)
          : null,
        session_id: row.session_id
          ? String(row.session_id)
          : null,
        execution_token: row.execution_token
          ? String(row.execution_token)
          : null,
        execution_lease_expires_at:
          row.execution_lease_expires_at
            ? new Date(
              row.execution_lease_expires_at
            )
            : null,
      };
    }
  } else {
    /*
     * requestHashRoot already contains the initiating wallet,
     * destination, scope and amount. Do not additionally filter
     * by claims.wallet_address because identity allocations may
     * be recorded under another linked wallet.
     */
    const existingAll = await sql`
      SELECT
        id,
        status,
        tx_signature,
        request_hash,
        session_id,
        execution_token,
        execution_lease_expires_at,
        tx_last_valid_block_height
      FROM claims
      WHERE LEFT(
              idempotency_key,
              LENGTH(${identityIdempotencyPrefix})
            ) = ${identityIdempotencyPrefix}
          AND wallet_address =
            ANY(${scopedWallets}::text[])
        AND status IN ('created', 'succeeded')
      ORDER BY id ASC
      LIMIT 1
    `;

    if (existingAll?.length) {
      const row = existingAll[0];

      if (
        String(row.request_hash || '') &&
        String(row.request_hash) !==
        requestHashRoot
      ) {
        return json(409, {
          success: false,
          error:
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        });
      }

      existingClaim = {
        id: Number(row.id),
        status: String(row.status || ''),
        tx_signature: row.tx_signature
          ? String(row.tx_signature)
          : null,
        tx_last_valid_block_height:
          row.tx_last_valid_block_height != null
            ? Number(row.tx_last_valid_block_height)
            : null,
        request_hash: row.request_hash
          ? String(row.request_hash)
          : null,
        session_id: row.session_id
          ? String(row.session_id)
          : null,
        execution_token: row.execution_token
          ? String(row.execution_token)
          : null,
        execution_lease_expires_at:
          row.execution_lease_expires_at
            ? new Date(
              row.execution_lease_expires_at
            )
            : null,
      };
    }
  }

  if (existingClaim) {
    /*
    * A finalized claim is a safe successful deduplication.
    */
    if (existingClaim.status === 'succeeded') {
      return json(200, {
        success: true,
        deduped: true,
        scope: isAllPhases ? 'all' : 'phase',
        phase_id: isAllPhases
          ? undefined
          : phaseIdRaw,
        status: 'succeeded',
        tx_signature:
          existingClaim.tx_signature,
      });
    }

    /*
    * A created row without a transaction signature means the
    * reservation exists, but no safely recoverable blockchain
    * transaction has yet been recorded.
    *
    * Do not report it as success and do not send another
    * transaction using the same request.
    */
    if (!existingClaim.tx_signature) {
      const leaseExpired =
        !existingClaim.execution_lease_expires_at ||
        existingClaim.execution_lease_expires_at.getTime() <=
        Date.now();

      /*
       * Another executor still owns this reservation.
       */
      if (!leaseExpired) {
        return json(409, {
          success: false,
          error: 'CLAIM_ALREADY_PROCESSING',
          status: 'created',
        });
      }

      /*
       * No transaction signature was persisted before the execution
       * lease expired.
       *
       * Because every live executor is fenced by execution_token +
       * execution_lease_expires_at before broadcast, this stale
       * reservation can now be safely retired.
       */
      const retired = isAllPhases
        ? await sql`
      UPDATE claims
      SET
        status = 'failed',
        error = 'CLAIM_EXECUTION_LEASE_EXPIRED',
        execution_token = NULL,
        execution_lease_expires_at = NULL
      WHERE LEFT(
              idempotency_key,
              LENGTH(${identityIdempotencyPrefix})
            ) = ${identityIdempotencyPrefix}
          AND wallet_address =
            ANY(${scopedWallets}::text[])
        AND status = 'created'
        AND tx_signature IS NULL
        AND (
          execution_lease_expires_at IS NULL
          OR execution_lease_expires_at <= now()
        )
      RETURNING id
    `
        : await sql`
      UPDATE claims
      SET
        status = 'failed',
        error = 'CLAIM_EXECUTION_LEASE_EXPIRED',
        execution_token = NULL,
        execution_lease_expires_at = NULL
      WHERE id = ${existingClaim.id}
        AND status = 'created'
        AND tx_signature IS NULL
        AND (
          execution_lease_expires_at IS NULL
          OR execution_lease_expires_at <= now()
        )
      RETURNING id
    `;

      /*
       * Another request may have recovered or advanced the claim
       * between our SELECT and UPDATE.
       */
      if (!retired.length) {
        return json(409, {
          success: false,
          error: 'CLAIM_ALREADY_PROCESSING',
          status: 'created',
        });
      }

      /*
       * The stale reservation has been safely retired.
       * Ask the caller to retry; the next execution can create a fresh
       * reservation using the same idempotency key because failed rows
       * are not part of the active idempotency constraint.
       */
      return json(409, {
        success: false,
        error: 'CLAIM_STALE_RESERVATION_RECOVERED',
        status: 'failed',
        retryable: true,
      });
    }

    let transactionState: ClaimTransactionState;

    try {
      transactionState =
        await getClaimTransactionState(
          existingClaim.tx_signature
        );
    } catch (error) {
      console.error(
        'claim transaction recovery check failed:',
        error
      );

      return json(503, {
        success: false,
        error:
          'CLAIM_TRANSACTION_STATUS_UNAVAILABLE',
        status: 'created',
        tx_signature:
          existingClaim.tx_signature,
      });
    }

    if (transactionState === 'failed') {
      /*
       * Solana has definitively reported that the previously persisted
       * transaction failed.
       *
       * Retiring the claim reservation and releasing any ATA reimbursement
       * reservation must happen atomically. Otherwise a DB/network failure
       * between the two operations could leave the ATA entitlement stuck
       * behind a transaction that can never succeed.
       */
      const failedRecoveryPool = createDbPool();
      let failedRecoveryClient:
        PoolClient | null = null;

      try {
        failedRecoveryClient =
          await failedRecoveryPool.connect();

        const failedRecoverySql =
          createTransactionSql(
            failedRecoveryClient
          );

        await failedRecoveryClient.query(
          'BEGIN'
        );

        const failedRows = isAllPhases
          ? await failedRecoverySql`
              UPDATE claims
              SET
                status = 'failed',
                error = 'CLAIM_TX_FAILED',
                execution_token = NULL,
                execution_lease_expires_at = NULL
              WHERE LEFT(
                      idempotency_key,
                      LENGTH(${identityIdempotencyPrefix})
                    ) = ${identityIdempotencyPrefix}
                AND wallet_address =
                  ANY(${scopedWallets}::text[])
                AND status = 'created'
                AND tx_signature =
                  ${existingClaim.tx_signature}
              RETURNING
                id,
                session_id
            `
          : await failedRecoverySql`
              UPDATE claims
              SET
                status = 'failed',
                error = 'CLAIM_TX_FAILED',
                execution_token = NULL,
                execution_lease_expires_at = NULL
              WHERE wallet_address = ${wallet}
                AND phase_id = ${phaseIdRaw}
                AND idempotency_key =
                  ${idemKeyRoot}
                AND status = 'created'
                AND tx_signature =
                  ${existingClaim.tx_signature}
              RETURNING
                id,
                session_id
            `;

        /*
         * Prefer session ownership returned by the rows we actually retired.
         * If another recovery request already retired them, fall back to the
         * persisted session_id loaded with existingClaim.
         */
        const failedSessionIds =
          Array.from(
            new Set(
              failedRows
                .map((row) =>
                  asStr(
                    asDbRow(row).session_id
                  )
                )
                .filter(Boolean)
            )
          );

        if (failedSessionIds.length > 1) {
          throw new Error(
            'CLAIM_FAILED_RECOVERY_SESSION_MISMATCH'
          );
        }

        const failedSessionId =
          failedSessionIds[0] ||
          asStr(existingClaim.session_id);

        /*
         * The blockchain transaction definitely failed, so any ATA
         * reimbursement reserved by this exact signature is unused and
         * may safely become available again.
         */
        if (failedSessionId) {
          await failedRecoverySql`
            UPDATE claim_fee_payments p
            SET
              ata_consumed_tx_signature = NULL
            FROM claim_sessions s
            WHERE s.id = ${failedSessionId}
              AND s.payment_id = p.id
              AND p.ata_consumed_at IS NULL
              AND p.ata_consumed_tx_signature =
                ${existingClaim.tx_signature}
          `;
        }

        await failedRecoveryClient.query(
          'COMMIT'
        );
      } catch (error) {
        if (failedRecoveryClient) {
          try {
            await failedRecoveryClient.query(
              'ROLLBACK'
            );
          } catch (rollbackError) {
            console.error(
              'failed claim recovery rollback failed:',
              rollbackError
            );
          }
        }

        console.error(
          'failed to atomically retire recovered claim:',
          error
        );

        return json(500, {
          success: false,
          error:
            'CLAIM_FAILED_RECOVERY_DB_FAILED',
          status: 'created',
          tx_signature:
            existingClaim.tx_signature,
        });
      } finally {
        failedRecoveryClient?.release();

        try {
          await failedRecoveryPool.end();
        } catch (poolError) {
          console.error(
            'failed claim recovery pool close failed:',
            poolError
          );
        }
      }

      return json(409, {
        success: false,
        error: 'CLAIM_TX_FAILED',
        status: 'failed',
        tx_signature:
          existingClaim.tx_signature,
      });
    }

    /*
    * A pending transaction is already known to Solana.
    * Never retire or replace it.
    */
    if (transactionState === 'pending') {
      return json(409, {
        success: false,
        error: 'CLAIM_ALREADY_PROCESSING',
        status: 'created',
        tx_signature:
          existingClaim.tx_signature,
      });
    }

    /*
     * "not_found" needs special handling.
     *
     * The signature is persisted before broadcast. Therefore a process
     * crash may leave a signed claim in the DB even though the transaction
     * was never submitted to Solana.
     *
     * While the transaction's blockhash is still valid, we must wait:
     * the original signed transaction could still potentially be submitted.
     *
     * Once lastValidBlockHeight has passed, that exact transaction can no
     * longer become a valid new Solana transaction. If it is still not
     * found, the reservation may be safely retired.
     */
    if (transactionState === 'not_found') {
      const lastValidBlockHeight =
        existingClaim.tx_last_valid_block_height;

      /*
       * Legacy or incomplete rows without expiry metadata cannot be
       * automatically retired safely.
       */
      if (
        lastValidBlockHeight === null ||
        !Number.isSafeInteger(lastValidBlockHeight) ||
        lastValidBlockHeight <= 0
      ) {
        return json(409, {
          success: false,
          error: 'CLAIM_ALREADY_PROCESSING',
          status: 'created',
          tx_signature:
            existingClaim.tx_signature,
        });
      }

      let currentBlockHeight: number;

      try {
        const connection =
          getServerSolanaConnection();

        currentBlockHeight =
          await connection.getBlockHeight(
            'confirmed'
          );
      } catch (error) {
        console.error(
          'claim expiry block-height check failed:',
          error
        );

        return json(503, {
          success: false,
          error:
            'CLAIM_TRANSACTION_STATUS_UNAVAILABLE',
          status: 'created',
          tx_signature:
            existingClaim.tx_signature,
        });
      }

      /*
       * The signed transaction is still within its validity window.
       * Do not release the claim reservation yet.
       */
      if (
        currentBlockHeight <=
        lastValidBlockHeight
      ) {
        return json(409, {
          success: false,
          error: 'CLAIM_ALREADY_PROCESSING',
          status: 'created',
          tx_signature:
            existingClaim.tx_signature,
        });
      }

      /*
       * Solana still cannot find the transaction and its blockhash has
       * expired. The exact signed transaction can no longer be newly
       * accepted, so retire the DB reservation.
       */
      const expiredRecoveryPool =
        createDbPool();

      let expiredRecoveryClient:
        PoolClient | null = null;

      try {
        expiredRecoveryClient =
          await expiredRecoveryPool.connect();

        const expiredRecoverySql =
          createTransactionSql(
            expiredRecoveryClient
          );

        await expiredRecoveryClient.query(
          'BEGIN'
        );

        const expiredRows = isAllPhases
          ? await expiredRecoverySql`
            UPDATE claims
            SET
              status = 'failed',
              error =
                'CLAIM_TX_EXPIRED_NOT_FOUND',
              execution_token = NULL,
              execution_lease_expires_at = NULL
            WHERE LEFT(
                    idempotency_key,
                    LENGTH(${identityIdempotencyPrefix})
                  ) = ${identityIdempotencyPrefix}
              AND wallet_address =
                ANY(${scopedWallets}::text[])
              AND status = 'created'
              AND tx_signature =
                ${existingClaim.tx_signature}
            RETURNING
              id,
              session_id
          `
          : await expiredRecoverySql`
            UPDATE claims
            SET
              status = 'failed',
              error =
                'CLAIM_TX_EXPIRED_NOT_FOUND',
              execution_token = NULL,
              execution_lease_expires_at = NULL
            WHERE wallet_address = ${wallet}
              AND phase_id = ${phaseIdRaw}
              AND idempotency_key =
                ${idemKeyRoot}
              AND status = 'created'
              AND tx_signature =
                ${existingClaim.tx_signature}
            RETURNING
              id,
              session_id
          `;

        /*
         * Every row retired for the same signed transaction should
         * belong to one persisted claim session.
         */
        const expiredSessionIds =
          Array.from(
            new Set(
              expiredRows
                .map((row) =>
                  asStr(
                    asDbRow(row).session_id
                  )
                )
                .filter(Boolean)
            )
          );

        if (expiredSessionIds.length > 1) {
          throw new Error(
            'CLAIM_EXPIRED_RECOVERY_SESSION_MISMATCH'
          );
        }

        /*
         * If another recovery request already retired the rows,
         * expiredRows may be empty. In that case use the persisted
         * session ownership from existingClaim.
         */
        const expiredSessionId =
          expiredSessionIds[0] ||
          asStr(existingClaim.session_id);

        /*
         * The exact signed transaction is now expired and still
         * absent from Solana. It can no longer create the ATA, so any
         * ATA reimbursement reservation held by this signature is
         * safe to release.
         */
        if (expiredSessionId) {
          await expiredRecoverySql`
          UPDATE claim_fee_payments p
          SET
            ata_consumed_tx_signature = NULL
          FROM claim_sessions s
          WHERE s.id = ${expiredSessionId}
            AND s.payment_id = p.id
            AND p.ata_consumed_at IS NULL
            AND p.ata_consumed_tx_signature =
              ${existingClaim.tx_signature}
        `;
        }

        await expiredRecoveryClient.query(
          'COMMIT'
        );
      } catch (error) {
        if (expiredRecoveryClient) {
          try {
            await expiredRecoveryClient.query(
              'ROLLBACK'
            );
          } catch (rollbackError) {
            console.error(
              'expired claim recovery rollback failed:',
              rollbackError
            );
          }
        }

        console.error(
          'failed to atomically retire expired claim:',
          error
        );

        return json(500, {
          success: false,
          error:
            'CLAIM_EXPIRED_RECOVERY_DB_FAILED',
          status: 'created',
          tx_signature:
            existingClaim.tx_signature,
        });
      } finally {
        expiredRecoveryClient?.release();

        try {
          await expiredRecoveryPool.end();
        } catch (poolError) {
          console.error(
            'expired claim recovery pool close failed:',
            poolError
          );
        }
      }

      return json(409, {
        success: false,
        error:
          'CLAIM_TX_EXPIRED_NOT_FOUND',
        status: 'failed',
        retryable: true,
        tx_signature:
          existingClaim.tx_signature,
      });
    }

    /*
    * The blockchain transfer succeeded but the database row
    * was not finalized. Complete the interrupted DB transition.
    */
    const recoveryPool = createDbPool();
    let recoveryClient: PoolClient | null = null;

    try {
      recoveryClient = await recoveryPool.connect();
      const recoverySql =
        createTransactionSql(recoveryClient);

      await recoveryClient.query('BEGIN');

      const recoveredRows = isAllPhases
        ? await recoverySql`
            UPDATE claims
            SET
              status = 'succeeded',
              tx_signature = ${existingClaim.tx_signature},
              error = NULL,
              execution_token = NULL,
              execution_lease_expires_at = NULL
            WHERE LEFT(
                    idempotency_key,
                    LENGTH(${identityIdempotencyPrefix})
                  ) = ${identityIdempotencyPrefix}
              AND wallet_address =
                ANY(${scopedWallets}::text[])
              AND status = 'created'
              AND tx_signature = ${existingClaim.tx_signature}
            RETURNING
              id,
              session_id,
              claim_amount_base
          `
        : await recoverySql`
            UPDATE claims
            SET
              status = 'succeeded',
              tx_signature = ${existingClaim.tx_signature},
              error = NULL,
              execution_token = NULL,
              execution_lease_expires_at = NULL
            WHERE wallet_address = ${wallet}
              AND phase_id = ${phaseIdRaw}
              AND idempotency_key = ${idemKeyRoot}
              AND status = 'created'
              AND tx_signature = ${existingClaim.tx_signature}
            RETURNING
              id,
              session_id,
              claim_amount_base
          `;

      let transitionedBase = 0n;

      for (const row of recoveredRows) {
        const record = asDbRow(row);

        transitionedBase += BigInt(
          String(
            record.claim_amount_base ??
            '0'
          )
        );
      }

      /*
 * Every claim row recovered as part of the same blockchain
 * transaction must belong to exactly one persisted claim session.
 *
 * Recovery must use persisted DB ownership rather than trusting
 * the session_id supplied by the retrying request.
 */
      const recoveredSessionIds = Array.from(
        new Set(
          recoveredRows
            .map((row) =>
              asStr(
                asDbRow(row).session_id
              )
            )
            .filter(Boolean)
        )
      );

      if (
        transitionedBase > 0n &&
        recoveredSessionIds.length !== 1
      ) {
        throw new Error(
          'CLAIM_RECOVERY_SESSION_MISMATCH'
        );
      }

      const recoveredSessionId =
        recoveredSessionIds[0] ?? '';

      /*
       * If this transaction created the destination ATA, finalize the
       * previously reserved ATA reimbursement entitlement.
       */
      if (recoveredSessionId) {
        await recoverySql`
                UPDATE claim_fee_payments p
                SET
                  ata_consumed_at =
                    COALESCE(
                      p.ata_consumed_at,
                      now()
                    )
                FROM claim_sessions s
                WHERE s.id =
                  ${recoveredSessionId}
                  AND s.payment_id = p.id
                  AND p.ata_creation_lamports > 0
                  AND p.ata_consumed_at IS NULL
                  AND p.ata_consumed_tx_signature =
                    ${existingClaim.tx_signature}
              `;
      }

      /*
       * Recovery must perform the same economic session transition as
       * the normal finalize path.
       */
      if (transitionedBase > 0n) {
        const transitionedHuman =
          baseToDecimalString(
            transitionedBase,
            MEGY_DECIMALS
          );

        const updatedSessionRows =
          await recoverySql`
                  UPDATE claim_sessions
                  SET total_claimed_in_session =
                    COALESCE(
                      total_claimed_in_session,
                      0
                    ) + ${transitionedHuman}
                  WHERE id = ${recoveredSessionId}
                  RETURNING id
                `;

        if (updatedSessionRows.length !== 1) {
          throw new Error(
            'CLAIM_RECOVERY_SESSION_FINALIZE_MISMATCH'
          );
        }

        /*
         * Recalculate the authoritative remaining balance after the
         * recovered claim rows have transitioned to succeeded.
         *
         * Solana wallet addresses are case-sensitive, so all identity
         * scope comparisons remain exact.
         */
        const recoveryTotals = isAllPhases
          ? await recoverySql`
                    WITH scoped_wallets AS (
                      SELECT unnest(
                        ${scopedWallets}::text[]
                      ) AS wallet_address
                    ),
                    snaps AS (
                      SELECT
                        COALESCE(
                          SUM(cs.megy_amount_base),
                          0
                        ) AS snap_base
                      FROM claim_snapshots cs
                      JOIN scoped_wallets sw
                        ON sw.wallet_address =
                          cs.wallet_address
                    ),
                    cls AS (
                      SELECT
                        COALESCE(
                          SUM(c.claim_amount_base),
                          0
                        ) AS claimed_base
                      FROM claims c
                      JOIN scoped_wallets sw
                        ON sw.wallet_address =
                          c.wallet_address
                      WHERE c.status IN (
                        'created',
                        'succeeded'
                      )
                    )
                    SELECT
                      (
                        SELECT snap_base
                        FROM snaps
                      ) AS snap_base,
                      (
                        SELECT claimed_base
                        FROM cls
                      ) AS claimed_base
                  `
          : await recoverySql`
                    WITH snaps AS (
                      SELECT
                        COALESCE(
                          SUM(megy_amount_base),
                          0
                        ) AS snap_base
                      FROM claim_snapshots
                      WHERE wallet_address = ${wallet}
                        AND phase_id = ${phaseIdRaw}
                    ),
                    cls AS (
                      SELECT
                        COALESCE(
                          SUM(claim_amount_base),
                          0
                        ) AS claimed_base
                      FROM claims
                      WHERE wallet_address = ${wallet}
                        AND phase_id = ${phaseIdRaw}
                        AND status IN (
                          'created',
                          'succeeded'
                        )
                    )
                    SELECT
                      (
                        SELECT snap_base
                        FROM snaps
                      ) AS snap_base,
                      (
                        SELECT claimed_base
                        FROM cls
                      ) AS claimed_base
                  `;

        const recoverySnapBase =
          BigInt(
            String(
              recoveryTotals?.[0]?.snap_base ??
              '0'
            )
          );

        const recoveryClaimedBase =
          BigInt(
            String(
              recoveryTotals?.[0]?.claimed_base ??
              '0'
            )
          );

        const recoveryRemainingBase =
          recoverySnapBase >
            recoveryClaimedBase
            ? recoverySnapBase -
            recoveryClaimedBase
            : 0n;

        /*
         * Match the normal finalize path: when nothing remains
         * claimable, close the recovered session as well.
         */
        if (recoveryRemainingBase <= 0n) {
          const closedSessionRows =
            await recoverySql`
                    UPDATE claim_sessions
                    SET
                      status = 'closed',
                      closed_at = COALESCE(
                        closed_at,
                        now()
                      )
                    WHERE id = ${recoveredSessionId}
                      AND status = 'open'
                    RETURNING id
                  `;

          if (closedSessionRows.length > 1) {
            throw new Error(
              'CLAIM_RECOVERY_SESSION_CLOSE_MISMATCH'
            );
          }
        }
      }

      await recoveryClient.query('COMMIT');

      return json(200, {
        success: true,
        deduped: true,
        recovered: true,
        scope: isAllPhases
          ? 'all'
          : 'phase',
        phase_id: isAllPhases
          ? undefined
          : phaseIdRaw,
        status: 'succeeded',
        tx_signature:
          existingClaim.tx_signature,
      });
    } catch (error) {
      if (recoveryClient) {
        try {
          await recoveryClient.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'claim recovery rollback failed:',
            rollbackError
          );
        }
      }

      console.error(
        'claim finalize recovery failed:',
        error
      );

      return json(500, {
        success: false,
        error:
          'DB_FINALIZE_RECOVERY_FAILED',
        status: 'created',
        tx_signature:
          existingClaim.tx_signature,
      });
    } finally {
      recoveryClient?.release();

      try {
        await recoveryPool.end();
      } catch (poolError) {
        console.error(
          'claim recovery pool close failed:',
          poolError
        );
      }
    }
  }

  // --- Step 1: DB reservation (short TX) ---
  let claimRowIds: number[] = [];
  let splits: Split[] = [];
  let sessionPaymentId:
    number | null = null;

  const reservationPool = createDbPool();
  let reservationClient: PoolClient | null = null;

  try {
    reservationClient = await reservationPool.connect();
    const reservationSql =
      createTransactionSql(reservationClient);

    await reservationClient.query('BEGIN');

    const s = await reservationSql`
      SELECT
        id,
        wallet_address,
        destination,
        phase_id,
        status,
        opened_at,
        payment_id
      FROM claim_sessions
      WHERE id = ${sessionId}
        AND opened_at >
          now() - (${SESSION_MAX_AGE_MINUTES} || ' minutes')::interval
      LIMIT 1
      FOR UPDATE
    `;
    if (!s?.length) {
      await reservationClient.query('ROLLBACK');
      return json(404, { success: false, error: 'SESSION_NOT_FOUND' });
    }
    if (String(s[0].wallet_address) !== wallet) {
      await reservationClient.query('ROLLBACK');
      return json(403, { success: false, error: 'SESSION_WALLET_MISMATCH' });
    }
    if (String(s[0].status) !== 'open') {
      await reservationClient.query('ROLLBACK');
      return json(409, { success: false, error: 'SESSION_NOT_OPEN' });
    }

    if (String(s[0].destination) !== destination) {
      await reservationClient.query('ROLLBACK');
      return json(409, { success: false, error: 'SESSION_DESTINATION_MISMATCH' });
    }

    if (Number(s[0].phase_id) !== phaseIdRaw) {
      await reservationClient.query('ROLLBACK');

      return json(409, {
        success: false,
        error: 'SESSION_PHASE_MISMATCH',
      });
    }

    const sessionPaymentIdRaw =
      s[0].payment_id;

    sessionPaymentId =
      sessionPaymentIdRaw == null
        ? null
        : Number(sessionPaymentIdRaw);

    if (
      sessionPaymentId !== null &&
      (
        !Number.isSafeInteger(
          sessionPaymentId
        ) ||
        sessionPaymentId <= 0
      )
    ) {
      await reservationClient.query(
        'ROLLBACK'
      );

      return json(500, {
        success: false,
        error:
          'SESSION_PAYMENT_ID_INVALID',
      });
    }

    await reservationSql`
      SELECT pg_advisory_xact_lock(
        hashtext(${claimLockKey})
      )
    `;

    /*
    * Authoritative idempotency recheck.
    *
    * The initial idempotency lookup happens before this transaction
    * acquires the advisory lock. Another request may therefore create
    * the reservation while this request is waiting for the lock.
    *
    * Recheck after acquiring the lock and before calculating claimable
    * balances or inserting any new claim rows.
    */
    let lockedExistingRows;

    if (!isAllPhases) {
      lockedExistingRows = await reservationSql`
        SELECT
          id,
          status,
          tx_signature,
          request_hash
        FROM claims
        WHERE wallet_address = ${wallet}
          AND phase_id = ${phaseIdRaw}
          AND idempotency_key = ${idemKeyRoot}
          AND status IN ('created', 'succeeded')
        ORDER BY id ASC
        LIMIT 1
      `;
    } else {
      lockedExistingRows = await reservationSql`
        SELECT
          id,
          status,
          tx_signature,
          request_hash
        FROM claims
        WHERE LEFT(
                idempotency_key,
                LENGTH(${identityIdempotencyPrefix})
              ) = ${identityIdempotencyPrefix}
          AND wallet_address =
            ANY(${scopedWallets}::text[])
          AND status IN ('created', 'succeeded')
        ORDER BY id ASC
        LIMIT 1
      `;
    }

    if (lockedExistingRows?.length) {
      const lockedExisting =
        lockedExistingRows[0];

      const lockedRequestHash =
        lockedExisting.request_hash
          ? String(lockedExisting.request_hash)
          : null;

      /*
      * The same idempotency key must never represent two
      * economically different claim requests.
      */
      if (
        lockedRequestHash &&
        lockedRequestHash !== requestHashRoot
      ) {
        await reservationClient.query(
          'ROLLBACK'
        );

        return json(409, {
          success: false,
          error:
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        });
      }

      const lockedStatus = String(
        lockedExisting.status || ''
      );

      const lockedTxSignature =
        lockedExisting.tx_signature
          ? String(lockedExisting.tx_signature)
          : null;

      /*
      * Nothing in this request has been reserved yet, so it is safe
      * to roll back our short transaction before returning.
      * ROLLBACK also releases the advisory transaction lock.
      */
      await reservationClient.query(
        'ROLLBACK'
      );

      if (lockedStatus === 'succeeded') {
        return json(200, {
          success: true,
          deduped: true,
          scope: isAllPhases
            ? 'all'
            : 'phase',
          phase_id: isAllPhases
            ? undefined
            : phaseIdRaw,
          status: 'succeeded',
          tx_signature:
            lockedTxSignature,
        });
      }

      /*
      * Another executor already owns an active reservation.
      *
      * Do not perform blockchain recovery here while holding the
      * reservation path. The normal preflight recovery path will
      * inspect its signature/lease on a subsequent retry.
      */
      return json(409, {
        success: false,
        error: 'CLAIM_ALREADY_PROCESSING',
        status: 'created',
        tx_signature:
          lockedTxSignature,
      });
    }

    if (!isAllPhases) {
      const phaseId = phaseIdRaw;

      const rows = await reservationSql`
        WITH snap AS (
          SELECT COALESCE(SUM(megy_amount_base), 0) AS snap_base
          FROM claim_snapshots
          WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
        ),
        cl AS (
          SELECT COALESCE(SUM(claim_amount_base), 0) AS claimed_base
          FROM claims
          WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
            AND status IN ('created','succeeded')
        )
        SELECT
          (SELECT snap_base FROM snap) AS snap_base,
          (SELECT claimed_base FROM cl) AS claimed_base,
          p.phase_no,
          p.name AS phase_name
        FROM phases p
        WHERE p.id = ${phaseId}
        LIMIT 1
      `;

      const snapBase = BigInt(String(rows?.[0]?.snap_base ?? '0'));
      const claimedBase = BigInt(String(rows?.[0]?.claimed_base ?? '0'));
      const claimableBase = snapBase > claimedBase ? (snapBase - claimedBase) : 0n;

      if (amountBaseTotal > claimableBase) {
        await reservationClient.query('ROLLBACK');
        return json(409, { success: false, error: 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE', phase_id: phaseId });
      }

      const amountHuman = baseToDecimalString(amountBaseTotal, MEGY_DECIMALS);

      if (CLAIM_DRY_RUN) {
        splits = [{
          wallet_address: wallet,
          phase_id: phaseId,
          phase_no: rows?.[0]?.phase_no ? Number(rows[0].phase_no) : null,
          phase_name: rows?.[0]?.phase_name ? String(rows[0].phase_name) : null,
          amount_base: amountBaseTotal,
          amount_human: amountHuman,
          idem_key: idemKeyRoot,
        }];

        await reservationClient.query('ROLLBACK');
        return json(200, {
          success: true,
          dry_run: true,
          scope: 'phase',
          status: 'simulated',
          message: 'Dry run only. No MEGY transfer was sent and no claim was finalized.',
          requested_amount: baseToDecimalString(amountBaseTotal, MEGY_DECIMALS),
          megy_decimals: MEGY_DECIMALS,
          splits: splits.map((s) => ({
            wallet_address: s.wallet_address ?? wallet,
            phase_id: s.phase_id,
            phase_no: s.phase_no ?? null,
            phase_name: s.phase_name ?? null,
            phase_label: s.phase_name
              ? String(s.phase_name)
              : s.phase_no
                ? `Phase ${s.phase_no}`
                : `Phase ${s.phase_id}`,
            amount: s.amount_human,
          })),
        });
      }

      const ins = await reservationSql`
        INSERT INTO claims (
          wallet_address,
          claim_amount,
          claim_amount_base,
          destination,
          tx_signature,
          sol_fee_paid,
          timestamp,
          sol_fee_amount,
          phase_id,
          session_id,
          status,
          idempotency_key,
          request_hash,
          error,
          execution_token,
          execution_lease_expires_at
        )
        VALUES (
          ${wallet},
          ${amountHuman},
          ${amountBaseTotal.toString()},
          ${destination},
          ${null},
          ${false},
          now(),
          ${0},
          ${phaseId},
          ${sessionId},
          ${'created'},
          ${idemKeyRoot},
          ${requestHashRoot},
          ${null},
          ${executionToken},
          now() + (${CLAIM_EXECUTION_LEASE_SECONDS} || ' seconds')::interval
        )
        RETURNING id
      `;

      const id = Number(ins?.[0]?.id ?? 0) || 0;
      if (!id) throw new Error('RESERVE_INSERT_FAILED');

      claimRowIds = [id];
      splits = [{
        phase_id: phaseId,
        amount_base: amountBaseTotal,
        amount_human: amountHuman,
        idem_key: idemKeyRoot,
      }];
    } else {
      const rem = await reservationSql`
        WITH scoped_wallets AS (
          SELECT unnest(${scopedWallets}::text[]) AS wallet_address
        ),
        snaps AS (
          SELECT
            cs.wallet_address,
            cs.phase_id,
            COALESCE(SUM(cs.megy_amount_base), 0) AS snap_base
          FROM claim_snapshots cs
          JOIN scoped_wallets sw
            ON sw.wallet_address = cs.wallet_address
          GROUP BY cs.wallet_address, cs.phase_id
        ),
        cls AS (
          SELECT
            c.wallet_address,
            c.phase_id,
            COALESCE(SUM(c.claim_amount_base), 0) AS claimed_base
          FROM claims c
          JOIN scoped_wallets sw
            ON sw.wallet_address = c.wallet_address
          WHERE c.status IN ('created','succeeded')
          GROUP BY c.wallet_address, c.phase_id
        )
        SELECT
          s.wallet_address,
          s.phase_id,
          p.phase_no,
          p.name AS phase_name,
          (s.snap_base - COALESCE(c.claimed_base, 0)) AS remaining_base
        FROM snaps s
        LEFT JOIN cls c
          ON c.wallet_address = s.wallet_address
        AND c.phase_id = s.phase_id
        JOIN phases p
          ON p.id = s.phase_id
        WHERE (s.snap_base - COALESCE(c.claimed_base, 0)) > 0
        ORDER BY s.phase_id ASC, s.wallet_address ASC
      `;

      const list = (rem ?? [])
        .map((row: unknown) => {
          const record = asDbRow(row);

          return {
            phase_no:
              record.phase_no != null
                ? Number(record.phase_no)
                : null,

            phase_name:
              record.phase_name
                ? String(record.phase_name)
                : null,

            wallet_address:
              asStr(
                record.wallet_address
              ) || wallet,

            phase_id:
              Number(record.phase_id),

            remaining_base:
              BigInt(
                String(
                  record.remaining_base ??
                  '0'
                )
              ),
          };
        })
        .filter(
          (item) =>
            Number.isInteger(item.phase_id) &&
            item.phase_id > 0 &&
            item.remaining_base > 0n
        );

      if (list.length === 0) {
        await reservationClient.query('ROLLBACK');
        return json(409, { success: false, error: 'NO_CLAIMABLE_BALANCE' });
      }

      const totalClaimable = list.reduce(
        (acc, item) =>
          acc + item.remaining_base,
        0n
      );

      if (amountBaseTotal > totalClaimable) {
        await reservationClient.query(
          'ROLLBACK'
        );

        return json(409, {
          success: false,
          error:
            'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE',
        });
      }

      let allocationResult;

      try {
        allocationResult =
          allocateClaimAmountOrThrow(
            list.map((item) => ({
              walletAddress:
                item.wallet_address,
              phaseId:
                item.phase_id,
              phaseNo:
                item.phase_no ?? null,
              phaseName:
                item.phase_name ?? null,
              claimableBase:
                item.remaining_base,
            })),
            amountBaseTotal
          );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'CLAIM_ALLOCATION_FAILED';

        console.error(
          'all-phases claim allocation failed:',
          error
        );

        await reservationClient.query(
          'ROLLBACK'
        );

        if (
          message ===
          'CLAIM_AMOUNT_EXCEEDS_AVAILABLE'
        ) {
          return json(409, {
            success: false,
            error:
              'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE',
          });
        }

        return json(500, {
          success: false,
          error: 'ALLOCATION_MISMATCH',
        });
      }

      const alloc = allocationResult.allocations.map(
        (allocation) => ({
          wallet_address:
            allocation.walletAddress,
          phase_id:
            allocation.phaseId,
          phase_no:
            allocation.phaseNo ?? null,
          phase_name:
            allocation.phaseName ?? null,
          amount_base:
            allocation.amountBase,
        })
      );

      const ids: number[] = [];
      const sp: Split[] = [];

      if (CLAIM_DRY_RUN) {
        splits = alloc.map((a) => ({
          wallet_address: a.wallet_address,
          phase_id: a.phase_id,
          phase_no: a.phase_no ?? null,
          phase_name: a.phase_name ?? null,
          amount_base: a.amount_base,
          amount_human: baseToDecimalString(a.amount_base, MEGY_DECIMALS),
          idem_key: `${idemKeyRoot}#${a.wallet_address}#${a.phase_id}`,
        }));

        await reservationClient.query('ROLLBACK');
        return json(200, {
          success: true,
          dry_run: true,
          scope: 'all',
          status: 'simulated',
          message: 'Dry run only. No MEGY transfer was sent and no claim was finalized.',
          requested_amount: baseToDecimalString(amountBaseTotal, MEGY_DECIMALS),
          megy_decimals: MEGY_DECIMALS,
          splits: splits.map((s) => ({
            wallet_address: s.wallet_address ?? wallet,
            phase_id: s.phase_id,
            phase_no: s.phase_no ?? null,
            phase_name: s.phase_name ?? null,
            phase_label: s.phase_name
              ? String(s.phase_name)
              : s.phase_no
                ? `Phase ${s.phase_no}`
                : `Phase ${s.phase_id}`,
            amount: s.amount_human,
          })),
        });
      }

      for (const a of alloc) {
        const childKey = `${idemKeyRoot}#${a.wallet_address}#${a.phase_id}`;
        const amountHuman = baseToDecimalString(a.amount_base, MEGY_DECIMALS);

        const ins = await reservationSql`
          INSERT INTO claims (
            wallet_address,
            claim_amount,
            claim_amount_base,
            destination,
            tx_signature,
            sol_fee_paid,
            timestamp,
            sol_fee_amount,
            phase_id,
            session_id,
            status,
            idempotency_key,
            request_hash,
            error,
            execution_token,
            execution_lease_expires_at
          )
          VALUES (
            ${a.wallet_address},
            ${amountHuman},
            ${a.amount_base.toString()},
            ${destination},
            ${null},
            ${false},
            now(),
            ${0},
            ${a.phase_id},
            ${sessionId},
            ${'created'},
            ${childKey},
            ${requestHashRoot},
            ${null},
            ${executionToken},
            now() + (${CLAIM_EXECUTION_LEASE_SECONDS} || ' seconds')::interval
          )
          RETURNING id
        `;

        const id = Number(ins?.[0]?.id ?? 0) || 0;
        if (!id) throw new Error('RESERVE_INSERT_FAILED');
        ids.push(id);

        sp.push({
          wallet_address: a.wallet_address,
          phase_id: a.phase_id,
          phase_no: a.phase_no ?? null,
          phase_name: a.phase_name ?? null,
          amount_base: a.amount_base,
          amount_human: amountHuman,
          idem_key: childKey,
        });
      }

      claimRowIds = ids;
      splits = sp;
    }

    await reservationClient.query('COMMIT');
  } catch (e) {
    if (reservationClient) {
      try {
        await reservationClient.query(
          'ROLLBACK'
        );
      } catch (rollbackError) {
        console.error(
          'reservation rollback failed:',
          rollbackError
        );
      }
    }

    console.error(
      'reservation failed:',
      e
    );

    return json(500, {
      success: false,
      error: 'DB_RESERVATION_FAILED',
    });
  } finally {
    reservationClient?.release();

    try {
      await reservationPool.end();
    } catch (poolError) {
      console.error(
        'reservation pool close failed:',
        poolError
      );
    }
  }

  // --- Step 2: On-chain transfer (single tx: total amount) ---
  let sig = '';
  let expectedSignature = '';
  let broadcastAttempted = false;
  let definitiveChainFailure = false;
  let ataCreatedByThisTransaction =
    false;

  try {
    const mintPk = new PublicKey(MEGY_MINT);
    const conn =
      getServerSolanaConnection();
    const treasurySigner = loadKeypair();
    const treasuryOwner = treasurySigner.publicKey;

    const destPk = new PublicKey(destination);

    const fromAta = await getAssociatedTokenAddress(mintPk, treasuryOwner, false);
    const toAta = await getAssociatedTokenAddress(mintPk, destPk, false);

    const instructions:
      TransactionInstruction[] = [];

    const toInfo =
      await conn.getAccountInfo(
        toAta,
        'confirmed'
      );

    if (!toInfo) {
      ataCreatedByThisTransaction = true;

      instructions.push(
        createAssociatedTokenAccountInstruction(
          treasuryOwner,
          toAta,
          destPk,
          mintPk
        )
      );
    }

    instructions.push(
      createTransferInstruction(
        fromAta,
        toAta,
        treasuryOwner,
        amountBaseTotal
      )
    );

    const tx =
      new Transaction().add(
        ...instructions
      );
    tx.feePayer = treasuryOwner;

    const latest = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;

    tx.sign(treasurySigner);

    if (!tx.signature) {
      throw new Error(
        'CLAIM_TX_SIGNATURE_MISSING'
      );
    }

    /*
    * The signature is deterministic after the transaction has
    * been signed. Persist it before broadcasting so an API crash
    * after submission can be recovered safely.
    */
    expectedSignature = bs58.encode(
      tx.signature
    );

    const signaturePersistedRows = await sql`
      UPDATE claims
      SET
        tx_signature = ${expectedSignature},
        tx_last_valid_block_height =
          ${latest.lastValidBlockHeight},
        execution_token = NULL,
        execution_lease_expires_at = NULL
      WHERE id = ANY(${claimRowIds})
        AND status = 'created'
        AND execution_token = ${executionToken}
        AND execution_lease_expires_at > now()
      RETURNING id
    `;

    if (
      signaturePersistedRows.length !==
      claimRowIds.length
    ) {
      throw new Error(
        'CLAIM_EXECUTION_LEASE_LOST'
      );
    }

    if (ataCreatedByThisTransaction) {
      /*
       * Treasury must never fund a newly created destination ATA
       * unless this session carries a valid, unused ATA reimbursement
       * entitlement.
       *
       * The ATA may have existed when session/start ran and been
       * closed before execute, so execute must fail closed here.
       */
      if (sessionPaymentId === null) {
        throw new Error(
          'ATA_REIMBURSEMENT_REQUIRED'
        );
      }

      const reservedAtaPayment =
        await sql`
          UPDATE claim_fee_payments
          SET
            ata_consumed_tx_signature =
              ${expectedSignature}
          WHERE id =
            ${sessionPaymentId}
            AND ata_creation_lamports > 0
            AND ata_consumed_at IS NULL
            AND ata_consumed_tx_signature IS NULL
          RETURNING id
        `;

      if (!reservedAtaPayment?.length) {
        throw new Error(
          'ATA_ENTITLEMENT_RESERVATION_FAILED'
        );
      }
    }

    broadcastAttempted = true;

    sig = await conn.sendRawTransaction(
      tx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      }
    );

    if (sig !== expectedSignature) {
      throw new Error(
        'CLAIM_TX_SIGNATURE_MISMATCH'
      );
    }

    const conf = await conn.confirmTransaction(
      { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed'
    );

    if (conf?.value?.err) {
      definitiveChainFailure = true;
      throw new Error('CLAIM_TX_FAILED');
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'TRANSFER_FAILED';

    const msg =
      asStr(message) ||
      'TRANSFER_FAILED';

    console.error(
      'on-chain transfer failed:',
      error
    );

    const recoverySignature =
      sig || expectedSignature || null;

    /*
    * Cleanup after an on-chain execution error.
    *
    * A definite failure must retire the claim rows and release any ATA
    * reimbursement reservation atomically. An uncertain broadcast must
    * remain in "created" state so the normal recovery path can determine
    * the blockchain outcome safely.
    */
    if (claimRowIds.length) {
      if (
        !broadcastAttempted ||
        definitiveChainFailure
      ) {
        const failureCleanupPool =
          createDbPool();

        let failureCleanupClient:
          PoolClient | null = null;

        try {
          failureCleanupClient =
            await failureCleanupPool.connect();

          const failureCleanupSql =
            createTransactionSql(
              failureCleanupClient
            );

          await failureCleanupClient.query(
            'BEGIN'
          );

          /*
           * The transaction was either never broadcast or Solana
           * definitively reported failure. The reserved claim rows
           * can therefore be retired safely.
           */
          await failureCleanupSql`
                UPDATE claims
                SET
                  status = 'failed',
                  error = ${msg},
                  execution_token = NULL,
                  execution_lease_expires_at = NULL
                WHERE id = ANY(${claimRowIds})
                  AND status = 'created'
              `;

          /*
           * If this execution reserved an ATA reimbursement entitlement,
           * release that reservation in the same DB transaction.
           *
           * The exact transaction signature fence prevents this cleanup
           * from releasing an entitlement owned by another execution.
           */
          if (
            ataCreatedByThisTransaction &&
            sessionPaymentId !== null &&
            expectedSignature
          ) {
            await failureCleanupSql`
                  UPDATE claim_fee_payments
                  SET
                    ata_consumed_tx_signature =
                      NULL
                  WHERE id =
                    ${sessionPaymentId}
                    AND ata_consumed_at IS NULL
                    AND ata_consumed_tx_signature =
                      ${expectedSignature}
                `;
          }

          await failureCleanupClient.query(
            'COMMIT'
          );
        } catch (dbError) {
          if (failureCleanupClient) {
            try {
              await failureCleanupClient.query(
                'ROLLBACK'
              );
            } catch (rollbackError) {
              console.error(
                'claim failure cleanup rollback failed:',
                rollbackError
              );
            }
          }

          console.error(
            'failed to atomically clean up interrupted claim:',
            dbError
          );
        } finally {
          failureCleanupClient?.release();

          try {
            await failureCleanupPool.end();
          } catch (poolError) {
            console.error(
              'claim failure cleanup pool close failed:',
              poolError
            );
          }
        }
      } else {
        /*
         * Broadcast was attempted but its outcome is uncertain.
         *
         * Never mark the claim failed here and never release its ATA
         * reservation. The persisted signature + last valid block height
         * allow the normal recovery path to resolve the transaction later.
         */
        try {
          await sql`
                UPDATE claims
                SET
                  error =
                    ${`TRANSFER_STATUS_UNKNOWN:${msg}`}
                WHERE id = ANY(${claimRowIds})
                  AND status = 'created'
              `;
        } catch (dbError) {
          console.error(
            'failed to record uncertain claim status:',
            dbError
          );
        }
      }
    }

    if (
      broadcastAttempted &&
      !definitiveChainFailure
    ) {
      return json(503, {
        success: false,
        error:
          'CLAIM_TRANSACTION_STATUS_UNKNOWN',
        status: 'created',
        tx_signature: recoverySignature,
      });
    }

    return json(500, {
      success: false,
      error: msg,
      tx_signature: recoverySignature,
    });
  }

  // --- Step 3: Finalize in DB (short TX) ---
  const finalizePool = createDbPool();
  let finalizeClient: PoolClient | null = null;

  try {
    finalizeClient = await finalizePool.connect();
    const finalizeSql =
      createTransactionSql(finalizeClient);

    await finalizeClient.query('BEGIN');

    const updatedClaimRows =
      await finalizeSql`
        UPDATE claims
        SET status = 'succeeded',
            tx_signature = ${sig},
            error = NULL
        WHERE id = ANY(${claimRowIds})
          AND status = 'created'
          AND tx_signature = ${sig}
        RETURNING
          id,
          session_id,
          claim_amount_base
      `;

    let transitionedBase = 0n;

    for (const row of updatedClaimRows) {
      transitionedBase += BigInt(
        String(
          row.claim_amount_base ??
          '0'
        )
      );
    }

    if (transitionedBase > 0n) {
      const transitionedHuman =
        baseToDecimalString(
          transitionedBase,
          MEGY_DECIMALS
        );

      const updatedSessionRows =
        await finalizeSql`
          UPDATE claim_sessions
          SET total_claimed_in_session =
            COALESCE(
              total_claimed_in_session,
              0
            ) + ${transitionedHuman}
          WHERE id = ${sessionId}
          RETURNING id
        `;

      if (updatedSessionRows.length !== 1) {
        throw new Error(
          'CLAIM_SESSION_FINALIZE_MISMATCH'
        );
      }
    }

    if (
      ataCreatedByThisTransaction &&
      sessionPaymentId !== null
    ) {
      await finalizeSql`
        UPDATE claim_fee_payments
        SET
          ata_consumed_at = now(),
          ata_consumed_tx_signature =
            ${sig}
        WHERE id =
          ${sessionPaymentId}
          AND ata_creation_lamports > 0
          AND ata_consumed_at IS NULL
          AND ata_consumed_tx_signature =
            ${sig}
      `;
    }

    const totals = isAllPhases
      ? await finalizeSql`
          WITH scoped_wallets AS (
            SELECT unnest(${scopedWallets}::text[]) AS wallet_address
          ),
          snaps AS (
            SELECT
              COALESCE(
                SUM(cs.megy_amount_base),
                0
              ) AS snap_base
            FROM claim_snapshots cs
            JOIN scoped_wallets sw
              ON sw.wallet_address =
                cs.wallet_address
          ),
          cls AS (
            SELECT
              COALESCE(
                SUM(c.claim_amount_base),
                0
              ) AS claimed_base
            FROM claims c
            JOIN scoped_wallets sw
              ON sw.wallet_address =
                c.wallet_address
            WHERE c.status IN (
              'created',
              'succeeded'
            )
          )
          SELECT
            (
              SELECT snap_base
              FROM snaps
            ) AS snap_base,
            (
              SELECT claimed_base
              FROM cls
            ) AS claimed_base
        `
      : await finalizeSql`
          WITH snaps AS (
            SELECT
              COALESCE(
                SUM(megy_amount_base),
                0
              ) AS snap_base
            FROM claim_snapshots
            WHERE wallet_address = ${wallet}
              AND phase_id = ${phaseIdRaw}
          ),
          cls AS (
            SELECT
              COALESCE(
                SUM(claim_amount_base),
                0
              ) AS claimed_base
            FROM claims
            WHERE wallet_address = ${wallet}
              AND phase_id = ${phaseIdRaw}
              AND status IN (
                'created',
                'succeeded'
              )
          )
          SELECT
            (
              SELECT snap_base
              FROM snaps
            ) AS snap_base,
            (
              SELECT claimed_base
              FROM cls
            ) AS claimed_base
        `;

    const snapBaseAll = BigInt(String(totals?.[0]?.snap_base ?? '0'));
    const claimedBaseAll = BigInt(String(totals?.[0]?.claimed_base ?? '0'));
    const totalClaimableBase = snapBaseAll > claimedBaseAll ? (snapBaseAll - claimedBaseAll) : 0n;

    let closed = false;
    if (totalClaimableBase <= 0n) {
      await finalizeSql`
        UPDATE claim_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = ${sessionId} AND status = 'open'
      `;
      closed = true;
    }

    const totalClaimableRemaining = baseToDecimalString(totalClaimableBase, MEGY_DECIMALS);

    await finalizeClient.query('COMMIT');

    return json(200, {
      success: true,
      scope: isAllPhases ? 'all' : 'phase',
      tx_signature: sig,
      status: 'succeeded',
      session_closed: closed,
      total_claimable_remaining: totalClaimableRemaining,
      megy_decimals: MEGY_DECIMALS,
      splits: splits.map((s) => ({
        wallet_address: s.wallet_address ?? wallet,
        phase_id: s.phase_id,
        phase_no: s.phase_no ?? null,
        phase_name: s.phase_name ?? null,
        phase_label: s.phase_name
          ? String(s.phase_name)
          : s.phase_no
            ? `Phase ${s.phase_no}`
            : `Phase ${s.phase_id}`,
        amount: s.amount_human,
      })),
    });
  } catch (error: unknown) {
    if (finalizeClient) {
      try {
        await finalizeClient.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'finalize rollback failed:',
          rollbackError
        );
      }
    }

    console.error(
      'finalize failed after transfer:',
      error
    );

    return json(500, {
      success: false,
      error: 'DB_FINALIZE_FAILED_AFTER_TRANSFER',
      tx_signature: sig,
    });
  } finally {
    finalizeClient?.release();

    try {
      await finalizePool.end();
    } catch (poolError) {
      console.error(
        'finalize pool close failed:',
        poolError
      );
    }
  }
}