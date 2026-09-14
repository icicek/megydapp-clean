// app/api/admin/megy-issuance/broadcast/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { Pool, PoolClient } from 'pg';

import { getDatabaseUrl } from '@/app/api/_lib/database-url';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEGY_MINT_AUTHORITY =
  '42MsfyA39M8Dr3JFaf91zjyNg7V4XVUNVPKSbRaL4cfB';

type BroadcastBody = {
  intentId?: unknown;
  signedTransactionBase64?: unknown;
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
        '[MEGY_ISSUANCE_BROADCAST] rollback failed:',
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

function getServerRpcUrl(): string {
  const value =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

  if (!value) {
    throw new ApiError(
      500,
      'solana_rpc_missing',
      'Missing Solana RPC URL'
    );
  }

  return value;
}

function parseIntentId(value: unknown): string {
  const raw = String(value ?? '').trim();

  if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
    throw new ApiError(
      400,
      'invalid_intent_id'
    );
  }

  return raw;
}

function parseSignedTransactionBase64(
  value: unknown
): {
  raw: Buffer;
  transaction: Transaction;
  signature: string;
} {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    throw new ApiError(
      400,
      'signed_transaction_missing'
    );
  }

  let raw: Buffer;

  try {
    raw = Buffer.from(
      rawValue,
      'base64'
    );
  } catch {
    throw new ApiError(
      400,
      'signed_transaction_invalid'
    );
  }

  if (raw.length === 0) {
    throw new ApiError(
      400,
      'signed_transaction_invalid'
    );
  }

  let transaction: Transaction;

  try {
    transaction = Transaction.from(raw);
  } catch {
    throw new ApiError(
      400,
      'signed_transaction_invalid'
    );
  }

  /*
   * Our issuance transaction deliberately has exactly one
   * required signer:
   *
   * MEGY Mint Authority = Fee Payer = Ledger 42Ms...
   */
  if (
    transaction.signatures.length !== 1 ||
    !transaction.signatures[0]
  ) {
    throw new ApiError(
      400,
      'unexpected_signer_count'
    );
  }

  const signer = transaction.signatures[0];

  if (
    signer.publicKey.toBase58() !==
    MEGY_MINT_AUTHORITY
  ) {
    throw new ApiError(
      403,
      'unexpected_transaction_signer'
    );
  }

  if (!signer.signature) {
    throw new ApiError(
      400,
      'transaction_not_signed'
    );
  }

  /*
   * Cryptographically verify the Ledger signature locally
   * before touching intent state.
   */
  if (!transaction.verifySignatures()) {
    throw new ApiError(
      400,
      'invalid_transaction_signature'
    );
  }

  if (
    transaction.feePayer?.toBase58() !==
    MEGY_MINT_AUTHORITY
  ) {
    throw new ApiError(
      400,
      'unexpected_fee_payer'
    );
  }

  const signature =
    bs58.encode(signer.signature);

  return {
    raw,
    transaction,
    signature,
  };
}

function messagesEqual(
  a: Transaction,
  b: Transaction
): boolean {
  const aMessage =
    Buffer.from(a.serializeMessage());

  const bMessage =
    Buffer.from(b.serializeMessage());

  return aMessage.equals(bMessage);
}

export async function POST(
  req: NextRequest
) {
  const pool = createDbPool();

  try {
    verifyCsrf(req as any);

    await requireAdmin(req);

    let body: BroadcastBody;

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

    const {
      raw: signedRaw,
      transaction: signedTransaction,
      signature: expectedSignature,
    } =
      parseSignedTransactionBase64(
        body.signedTransactionBase64
      );

    const connection = new Connection(
      getServerRpcUrl(),
      {
        commitment: 'confirmed',
      }
    );

    /*
     * Check block height immediately before claiming the intent
     * for broadcast.
     */
    const currentBlockHeight =
      await connection.getBlockHeight(
        'confirmed'
      );

    const reservation =
      await runTransaction(
        pool,
        [
          `megy-issuance-intent:${intentId}`,
        ],
        async (client) => {
          const result =
            await client.query(
              `
                SELECT
                  id,
                  issuance_ledger_id,
                  mint_type,
                  amount_base::text
                    AS amount_base,
                  mint_address,
                  destination_wallet,
                  fee_payer_wallet,
                  created_by,
                  status,
                  recent_blockhash,
                  last_valid_block_height,
                  prepared_transaction_base64,
                  tx_signature,
                  expires_at,
                  completed_at,
                  cancelled_at

                FROM public.megy_issuance_intents

                WHERE id = $1::bigint

                FOR UPDATE
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
           * Idempotent retry:
           *
           * If this exact transaction has already reached the
           * broadcast state, do not mutate anything again.
           */
          if (
            intent.status === 'broadcast'
          ) {
            if (
              intent.tx_signature !==
              expectedSignature
            ) {
              throw new ApiError(
                409,
                'issuance_intent_signature_conflict'
              );
            }

            return {
              alreadyBroadcast: true,
              signature:
                expectedSignature,
              lastValidBlockHeight:
                Number(
                  intent.last_valid_block_height
                ),
            };
          }

          if (
            intent.status === 'completed'
          ) {
            if (
              intent.tx_signature ===
              expectedSignature
            ) {
              return {
                alreadyBroadcast: true,
                signature:
                  expectedSignature,
                lastValidBlockHeight:
                  Number(
                    intent.last_valid_block_height
                  ),
              };
            }

            throw new ApiError(
              409,
              'issuance_intent_already_completed'
            );
          }

          if (
            intent.status !== 'prepared'
          ) {
            throw new ApiError(
              409,
              'issuance_intent_not_prepared'
            );
          }

          if (
            new Date(
              intent.expires_at
            ).getTime() <= Date.now()
          ) {
            throw new ApiError(
              409,
              'issuance_intent_expired'
            );
          }

          if (
            !intent.prepared_transaction_base64
          ) {
            throw new ApiError(
              409,
              'prepared_transaction_missing'
            );
          }

          if (
            !intent.recent_blockhash ||
            !intent.last_valid_block_height
          ) {
            throw new ApiError(
              409,
              'prepared_blockhash_missing'
            );
          }

          if (
            intent.fee_payer_wallet !==
            MEGY_MINT_AUTHORITY
          ) {
            throw new ApiError(
              409,
              'issuance_fee_payer_mismatch'
            );
          }

          const lastValidBlockHeight =
            Number(
              intent.last_valid_block_height
            );

          if (
            !Number.isSafeInteger(
              lastValidBlockHeight
            )
          ) {
            throw new ApiError(
              500,
              'invalid_last_valid_block_height'
            );
          }

          if (
            currentBlockHeight >
            lastValidBlockHeight
          ) {
            throw new ApiError(
              409,
              'prepared_transaction_blockhash_expired'
            );
          }

          let preparedTransaction:
            Transaction;

          try {
            preparedTransaction =
              Transaction.from(
                Buffer.from(
                  intent
                    .prepared_transaction_base64,
                  'base64'
                )
              );
          } catch {
            throw new ApiError(
              500,
              'stored_prepared_transaction_invalid'
            );
          }

          /*
           * The signed transaction must contain exactly the
           * same Solana message produced by /prepare.
           *
           * Therefore none of these can be modified after
           * preparation:
           *
           * - fee payer
           * - blockhash
           * - mint
           * - destination ATA
           * - amount
           * - memo
           * - ATA creation instruction
           */
          if (
            !messagesEqual(
              preparedTransaction,
              signedTransaction
            )
          ) {
            throw new ApiError(
              409,
              'signed_transaction_message_mismatch'
            );
          }

          if (
            signedTransaction
              .recentBlockhash !==
            intent.recent_blockhash
          ) {
            throw new ApiError(
              409,
              'signed_transaction_blockhash_mismatch'
            );
          }

          /*
           * IMPORTANT:
           *
           * Transition to "broadcast" BEFORE sending to Solana.
           *
           * broadcast intents remain capacity-reserving even
           * after expires_at, preventing a successfully sent
           * issuance from silently losing its reservation if
           * the browser/server crashes before /confirm.
           */
          const updated =
            await client.query(
              `
                UPDATE public.megy_issuance_intents

                SET
                  status = 'broadcast',
                  tx_signature = $2,
                  updated_at = now()

                WHERE id = $1::bigint
                  AND status = 'prepared'

                RETURNING
                  id,
                  status,
                  tx_signature,
                  last_valid_block_height
              `,
              [
                intentId,
                expectedSignature,
              ]
            );

          if (
            updated.rowCount !== 1
          ) {
            throw new ApiError(
              409,
              'issuance_intent_broadcast_transition_failed'
            );
          }

          return {
            alreadyBroadcast: false,
            signature:
              expectedSignature,
            lastValidBlockHeight,
          };
        }
      );

    /*
     * An idempotent retry must NOT submit the same transaction
     * again unnecessarily.
     *
     * /confirm will inspect Solana using the stored signature.
     */
    if (
      reservation.alreadyBroadcast
    ) {
      return NextResponse.json(
        {
          success: true,
          status: 'broadcast',
          alreadyBroadcast: true,
          intentId,
          txSignature:
            reservation.signature,
          lastValidBlockHeight:
            reservation.lastValidBlockHeight,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    /*
     * Capacity is now safely reserved as "broadcast".
     *
     * From this point onward, any network/RPC error is treated
     * as potentially uncertain. We DO NOT release the intent
     * merely because sendRawTransaction throws.
     */
    let rpcSignature: string;

    try {
      rpcSignature =
        await connection.sendRawTransaction(
          signedRaw,
          {
            skipPreflight: false,
            preflightCommitment:
              'confirmed',
            maxRetries: 3,
          }
        );
    } catch (broadcastError) {
      console.error(
        '[MEGY_ISSUANCE_BROADCAST] RPC broadcast uncertain:',
        broadcastError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'broadcast_outcome_uncertain',
          intentId,
          txSignature:
            expectedSignature,
          lastValidBlockHeight:
            reservation.lastValidBlockHeight,
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
     * sendRawTransaction must return the deterministic
     * transaction signature we already derived locally.
     */
    if (
      rpcSignature !==
      expectedSignature
    ) {
      console.error(
        '[MEGY_ISSUANCE_BROADCAST] RPC signature mismatch',
        {
          intentId,
          expectedSignature,
          rpcSignature,
        }
      );

      /*
       * Keep status=broadcast.
       *
       * This is an abnormal/uncertain situation and must be
       * recovered by chain inspection rather than releasing
       * capacity.
       */
      return NextResponse.json(
        {
          success: false,
          error:
            'broadcast_signature_mismatch',
          intentId,
          txSignature:
            expectedSignature,
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

    return NextResponse.json(
      {
        success: true,
        status: 'broadcast',
        alreadyBroadcast: false,

        intentId,

        txSignature:
          expectedSignature,

        lastValidBlockHeight:
          reservation.lastValidBlockHeight,
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
      '[MEGY_ISSUANCE_BROADCAST] failed:',
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
          'megy_issuance_broadcast_failed',
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