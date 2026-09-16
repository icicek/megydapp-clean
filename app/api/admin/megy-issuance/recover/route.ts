// app/api/admin/megy-issuance/recover/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { Pool, PoolClient } from 'pg';

import { getDatabaseUrl } from '@/app/api/_lib/database-url';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * We deliberately wait well beyond lastValidBlockHeight before
 * treating an unseen broadcast transaction as expired.
 *
 * Issuance is rare and high-value, so safety is more important
 * than immediately releasing reserved capacity.
 */
const BROADCAST_RECOVERY_GRACE_BLOCKS = 300;

type RecoverBody = {
  intentId?: unknown;
};

class ApiError extends Error {
  status: number;
  code: string;

  constructor(
    status: number,
    code: string,
    message?: string
  ) {
    super(message || code);
    this.status = status;
    this.code = code;
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
        '[MEGY_ISSUANCE_RECOVER] rollback failed:',
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getServerRpcUrl(): string {
  const value =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

  if (!value) {
    throw new ApiError(
      500,
      'solana_rpc_missing'
    );
  }

  return value;
}

function parseIntentId(
  value: unknown
): string {
  const raw = String(value ?? '').trim();

  if (
    !/^\d+$/.test(raw) ||
    BigInt(raw) <= 0n
  ) {
    throw new ApiError(
      400,
      'invalid_intent_id'
    );
  }

  return raw;
}

function parseLastValidBlockHeight(
  value: unknown
): number {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new ApiError(
      500,
      'invalid_last_valid_block_height'
    );
  }

  return parsed;
}

async function transitionBroadcastIntent(
  pool: Pool,
  params: {
    intentId: string;
    issuanceLedgerId: string;
    txSignature: string;
    nextStatus: 'failed' | 'expired';
  }
): Promise<{
  changed: boolean;
  status: string;
}> {
  const {
    intentId,
    issuanceLedgerId,
    txSignature,
    nextStatus,
  } = params;

  return runTransaction(
    pool,
    [
      `megy-issuance-intent:${intentId}`,
      `megy-issuance-ledger:${issuanceLedgerId}`,
    ],
    async (client) => {
      /*
       * Keep the same lock order used by /broadcast and /confirm:
       *
       * intent → ledger
       */
      const intentResult =
        await client.query(
          `
            SELECT
              id,
              issuance_ledger_id,
              status,
              tx_signature

            FROM public.megy_issuance_intents

            WHERE id = $1::bigint

            FOR UPDATE
          `,
          [intentId]
        );

      const intent =
        intentResult.rows[0];

      if (!intent) {
        throw new ApiError(
          404,
          'issuance_intent_not_found'
        );
      }

      if (
        String(
          intent.issuance_ledger_id
        ) !== issuanceLedgerId
      ) {
        throw new ApiError(
          409,
          'issuance_intent_changed'
        );
      }

      if (
        intent.tx_signature !==
        txSignature
      ) {
        throw new ApiError(
          409,
          'issuance_intent_signature_mismatch'
        );
      }

      /*
       * Idempotent recovery.
       */
      if (
        intent.status === nextStatus
      ) {
        return {
          changed: false,
          status: nextStatus,
        };
      }

      /*
       * A concurrent /confirm may have completed the intent
       * between our RPC checks and this DB transaction.
       *
       * Never downgrade completed.
       */
      if (
        intent.status === 'completed'
      ) {
        return {
          changed: false,
          status: 'completed',
        };
      }

      if (
        intent.status !== 'broadcast'
      ) {
        throw new ApiError(
          409,
          'issuance_intent_state_conflict'
        );
      }

      const ledgerResult =
        await client.query(
          `
            SELECT id

            FROM public.megy_issuance_ledger

            WHERE id = $1::bigint

            FOR UPDATE
          `,
          [issuanceLedgerId]
        );

      if (
        ledgerResult.rowCount !== 1
      ) {
        throw new ApiError(
          409,
          'issuance_ledger_missing'
        );
      }

      const updateResult =
        await client.query(
          `
            UPDATE public.megy_issuance_intents

            SET
              status = $2,
              updated_at = now()

            WHERE id = $1::bigint
              AND status = 'broadcast'
              AND tx_signature = $3

            RETURNING
              id,
              status
          `,
          [
            intentId,
            nextStatus,
            txSignature,
          ]
        );

      if (
        updateResult.rowCount !== 1
      ) {
        throw new ApiError(
          409,
          'issuance_recovery_transition_failed'
        );
      }

      return {
        changed: true,
        status: nextStatus,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
  req: NextRequest
) {
  const pool = createDbPool();

  try {
    verifyCsrf(req as any);

    await requireAdmin(req);

    let body: RecoverBody;

    try {
      body = await req.json();
    } catch {
      throw new ApiError(
        400,
        'invalid_json'
      );
    }

    const intentId =
      parseIntentId(body.intentId);

    /*
     * Initial DB snapshot.
     *
     * No mutation yet.
     */
    const result =
      await pool.query(
        `
          SELECT
            id,
            issuance_ledger_id,
            status,
            tx_signature,
            last_valid_block_height,
            expires_at,
            completed_at,
            cancelled_at

          FROM public.megy_issuance_intents

          WHERE id = $1::bigint

          LIMIT 1
        `,
        [intentId]
      );

    const intent =
      result.rows[0];

    if (!intent) {
      throw new ApiError(
        404,
        'issuance_intent_not_found'
      );
    }

    /*
    * Terminal states are idempotent.
    *
    * completed is special: it is only valid if the
    * append-only mint event exists for this intent.
    */
    if (intent.status === 'completed') {
      const completedTxSignature =
        String(
          intent.tx_signature ?? ''
        ).trim();

      if (!completedTxSignature) {
        throw new ApiError(
          500,
          'completed_intent_missing_signature'
        );
      }

      const completedEventResult =
        await pool.query(
          `
            SELECT
              id,
              tx_signature
            FROM public.megy_mint_events
            WHERE tx_signature = $1
            LIMIT 1
          `,
          [completedTxSignature]
        );

      const completedEvent =
        completedEventResult.rows[0];

      if (!completedEvent) {
        throw new ApiError(
          500,
          'completed_intent_missing_mint_event'
        );
      }

      if (
        String(
          completedEvent.tx_signature ?? ''
        ) !== completedTxSignature
      ) {
        throw new ApiError(
          500,
          'completed_intent_mint_event_signature_mismatch'
        );
      }

      return NextResponse.json(
        {
          success: true,
          recovered: false,
          alreadyTerminal: true,
          intentId,
          status: 'completed',
          txSignature:
            intent.tx_signature ?? null,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    if (
      intent.status === 'failed' ||
      intent.status === 'expired' ||
      intent.status === 'cancelled'
    ) {
      return NextResponse.json(
        {
          success: true,
          recovered: false,
          alreadyTerminal: true,
          intentId,
          status: intent.status,
          txSignature:
            intent.tx_signature ?? null,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    if (
      intent.status !== 'broadcast'
    ) {
      throw new ApiError(
        409,
        'issuance_intent_not_broadcast'
      );
    }

    const txSignature =
      String(
        intent.tx_signature ?? ''
      ).trim();

    if (!txSignature) {
      throw new ApiError(
        409,
        'broadcast_signature_missing'
      );
    }

    const issuanceLedgerId =
      String(
        intent.issuance_ledger_id
      );

    const lastValidBlockHeight =
      parseLastValidBlockHeight(
        intent.last_valid_block_height
      );

    const connection =
      new Connection(
        getServerRpcUrl(),
        {
          commitment: 'confirmed',
        }
      );

    /*
     * ----------------------------------------------------------------------
     * PROBE 1 — transaction details
     * ----------------------------------------------------------------------
     *
     * If the transaction exists and succeeded, recovery MUST NOT
     * release capacity. /confirm must finalize the accounting.
     */
    const chainTx =
      await connection.getTransaction(
        txSignature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }
      );

    if (chainTx) {
      if (!chainTx.meta) {
        return NextResponse.json(
          {
            success: false,
            recovered: false,
            pending: true,

            error:
              'transaction_meta_unavailable',

            intentId,
            txSignature,
            status: 'broadcast',
          },
          {
            status: 202,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      /*
       * Definitive on-chain failure.
       */
      if (chainTx.meta.err) {
        const transition =
          await transitionBroadcastIntent(
            pool,
            {
              intentId,
              issuanceLedgerId,
              txSignature,
              nextStatus: 'failed',
            }
          );

        return NextResponse.json(
          {
            success: false,
            recovered:
              transition.changed,

            error:
              'onchain_transaction_failed',

            intentId,
            txSignature,

            status:
              transition.status,

            slot:
              chainTx.slot,
          },
          {
            status: 422,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      /*
       * Successful transaction exists.
       *
       * Never release the reservation here.
       * /confirm performs the exact prepared-message verification
       * and append-only mint ledger write.
       */
      return NextResponse.json(
        {
          success: false,
          recovered: false,

          error:
            'transaction_succeeded_use_confirm',

          intentId,
          txSignature,
          status: 'broadcast',

          slot:
            chainTx.slot,
        },
        {
          status: 409,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    /*
     * ----------------------------------------------------------------------
     * PROBE 2 — signature status history
     * ----------------------------------------------------------------------
     *
     * getTransaction may temporarily lag behind signature status.
     */
    const signatureStatuses =
      await connection.getSignatureStatuses(
        [txSignature],
        {
          searchTransactionHistory: true,
        }
      );

    const signatureStatus =
      signatureStatuses.value[0];

    if (signatureStatus) {
      if (signatureStatus.err) {
        const transition =
          await transitionBroadcastIntent(
            pool,
            {
              intentId,
              issuanceLedgerId,
              txSignature,
              nextStatus: 'failed',
            }
          );

        return NextResponse.json(
          {
            success: false,
            recovered:
              transition.changed,

            error:
              'onchain_transaction_failed',

            intentId,
            txSignature,

            status:
              transition.status,
          },
          {
            status: 422,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      /*
       * Signature exists and has no known error.
       *
       * The transaction may simply not yet be available through
       * getTransaction. Keep reservation.
       */
      return NextResponse.json(
        {
          success: false,
          recovered: false,
          pending: true,

          error:
            'transaction_seen_wait_for_confirm',

          intentId,
          txSignature,
          status: 'broadcast',

          confirmationStatus:
            signatureStatus
              .confirmationStatus ??
            null,
        },
        {
          status: 202,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    /*
     * ----------------------------------------------------------------------
     * PROBE 3 — blockhash lifetime
     * ----------------------------------------------------------------------
     */
    const currentBlockHeight =
      await connection.getBlockHeight(
        'confirmed'
      );

    const safeExpiryBlockHeight =
      lastValidBlockHeight +
      BROADCAST_RECOVERY_GRACE_BLOCKS;

    if (
      currentBlockHeight <=
      safeExpiryBlockHeight
    ) {
      return NextResponse.json(
        {
          success: false,
          recovered: false,
          pending: true,

          error:
            'broadcast_still_within_recovery_window',

          intentId,
          txSignature,
          status: 'broadcast',

          currentBlockHeight,
          lastValidBlockHeight,
          safeExpiryBlockHeight,
        },
        {
          status: 202,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    /*
     * ----------------------------------------------------------------------
     * FINAL DOUBLE CHECK
     * ----------------------------------------------------------------------
     *
     * We are now:
     *
     * - beyond lastValidBlockHeight
     * - beyond an additional safety grace
     * - getTransaction returned null
     * - signature history returned null
     *
     * Before releasing capacity, query both once more.
     */
    const [
      secondChainTx,
      secondStatusResponse,
    ] = await Promise.all([
      connection.getTransaction(
        txSignature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }
      ),

      connection.getSignatureStatuses(
        [txSignature],
        {
          searchTransactionHistory: true,
        }
      ),
    ]);

    if (secondChainTx) {
      if (!secondChainTx.meta) {
        return NextResponse.json(
          {
            success: false,
            recovered: false,
            pending: true,

            error:
              'transaction_meta_unavailable',

            intentId,
            txSignature,
            status: 'broadcast',
          },
          {
            status: 202,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      if (secondChainTx.meta.err) {
        const transition =
          await transitionBroadcastIntent(
            pool,
            {
              intentId,
              issuanceLedgerId,
              txSignature,
              nextStatus: 'failed',
            }
          );

        return NextResponse.json(
          {
            success: false,
            recovered:
              transition.changed,

            error:
              'onchain_transaction_failed',

            intentId,
            txSignature,

            status:
              transition.status,

            slot:
              secondChainTx.slot,
          },
          {
            status: 422,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      return NextResponse.json(
        {
          success: false,
          recovered: false,

          error:
            'transaction_succeeded_use_confirm',

          intentId,
          txSignature,
          status: 'broadcast',

          slot:
            secondChainTx.slot,
        },
        {
          status: 409,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    const secondSignatureStatus =
      secondStatusResponse.value[0];

    if (secondSignatureStatus) {
      if (
        secondSignatureStatus.err
      ) {
        const transition =
          await transitionBroadcastIntent(
            pool,
            {
              intentId,
              issuanceLedgerId,
              txSignature,
              nextStatus: 'failed',
            }
          );

        return NextResponse.json(
          {
            success: false,
            recovered:
              transition.changed,

            error:
              'onchain_transaction_failed',

            intentId,
            txSignature,

            status:
              transition.status,
          },
          {
            status: 422,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        );
      }

      return NextResponse.json(
        {
          success: false,
          recovered: false,
          pending: true,

          error:
            'transaction_seen_wait_for_confirm',

          intentId,
          txSignature,
          status: 'broadcast',

          confirmationStatus:
            secondSignatureStatus
              .confirmationStatus ??
            null,
        },
        {
          status: 202,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    /*
     * ----------------------------------------------------------------------
     * SAFE EXPIRY RECOVERY
     * ----------------------------------------------------------------------
     *
     * The signed transaction is now far beyond its valid blockhash
     * lifetime and remains unseen in both transaction lookup and
     * signature history.
     *
     * It can no longer be newly accepted with that blockhash.
     *
     * Mark as expired so the DB reservation is released.
     */
    const transition =
      await transitionBroadcastIntent(
        pool,
        {
          intentId,
          issuanceLedgerId,
          txSignature,
          nextStatus: 'expired',
        }
      );

    return NextResponse.json(
      {
        success: true,

        recovered:
          transition.changed,

        recovery:
          'expired_unseen_broadcast',

        intentId,
        txSignature,

        status:
          transition.status,

        currentBlockHeight,
        lastValidBlockHeight,
        safeExpiryBlockHeight,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      '[MEGY_ISSUANCE_RECOVER] failed:',
      error
    );

    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.code,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          'megy_issuance_recovery_failed',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } finally {
    try {
      await pool.end();
    } catch {
      // no-op
    }
  }
}