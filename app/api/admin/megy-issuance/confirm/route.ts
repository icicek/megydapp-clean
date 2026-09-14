// app/api/admin/megy-issuance/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { Pool, PoolClient } from 'pg';

import { getDatabaseUrl } from '@/app/api/_lib/database-url';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEGY_MAINNET_MINT =
  '7nJZvQZjt4XtTdti2mQMxboDvo93h23MUDDDX7EPzWwT';

const MEGY_MINT_AUTHORITY =
  '42MsfyA39M8Dr3JFaf91zjyNg7V4XVUNVPKSbRaL4cfB';

const BUCKETS = {
  coincarnation:
    '5xsUuakT88bUeU9WBn1iyHwqSKbj5b7m5Fms89gqqD7d',

  partnerships_ecosystem_growth:
    '6rUaTU9JhsKrMMnrUfcgEozzMpn6DCzDh4FWYRTWbP9K',

  fair_future_fund_reserve:
    '5vHvG6mbabynm21vUUrJQz9DSkBDRWgMha7w7tJ4kufz',

  liquidity:
    'DvMQnxDYUTn2DjhzK1KXJHfGKcsPRxeYf1fyKDidM9TF',

  team_contributors:
    '4Hysbg28nPdqpeaqjJ6Z9XMSX89f9oJXeWMv8iUuWX9z',
} as const;

type MintType =
  keyof typeof BUCKETS;

type ConfirmBody = {
  intentId?: unknown;
  txSignature?: unknown;
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

    const result =
      await work(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        '[MEGY_ISSUANCE_CONFIRM] rollback failed:',
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* Input / RPC helpers                                                        */
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
  const raw =
    String(value ?? '').trim();

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

function parseSignature(
  value: unknown
): string {
  const raw =
    String(value ?? '').trim();

  if (!raw) {
    throw new ApiError(
      400,
      'tx_signature_missing'
    );
  }

  let decoded: Uint8Array;

  try {
    decoded = bs58.decode(raw);
  } catch {
    throw new ApiError(
      400,
      'tx_signature_invalid'
    );
  }

  /*
   * Ed25519 transaction signatures are exactly 64 bytes.
   */
  if (decoded.length !== 64) {
    throw new ApiError(
      400,
      'tx_signature_invalid'
    );
  }

  return raw;
}

function parseMintType(
  value: unknown
): MintType {
  const raw =
    String(value ?? '').trim();

  if (!(raw in BUCKETS)) {
    throw new ApiError(
      500,
      'stored_mint_type_invalid'
    );
  }

  return raw as MintType;
}

function messagesEqual(
  preparedTransaction: Transaction,
  chainMessageBytes: Uint8Array
): boolean {
  const preparedMessage =
    Buffer.from(
      preparedTransaction.serializeMessage()
    );

  const actualMessage =
    Buffer.from(chainMessageBytes);

  return preparedMessage.equals(
    actualMessage
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
    /*
     * Administrative mutation endpoint.
     */
    verifyCsrf(req as any);

    await requireAdmin(req);

    let body: ConfirmBody;

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

    const txSignature =
      parseSignature(body.txSignature);

    /*
     * First load the intent WITHOUT changing anything.
     *
     * Blockchain verification happens before the final DB
     * mutation transaction.
     */
    const initialResult =
      await pool.query(
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
            completed_at

          FROM public.megy_issuance_intents

          WHERE id = $1::bigint

          LIMIT 1
        `,
        [intentId]
      );

    const initialIntent =
      initialResult.rows[0];

    if (!initialIntent) {
      throw new ApiError(
        404,
        'issuance_intent_not_found'
      );
    }

    /*
     * Already-completed requests are allowed to continue into
     * the idempotent finalization check below.
     */
    if (
      initialIntent.status !== 'broadcast' &&
      initialIntent.status !== 'completed'
    ) {
      throw new ApiError(
        409,
        'issuance_intent_not_broadcast'
      );
    }

    if (
      initialIntent.tx_signature !==
      txSignature
    ) {
      throw new ApiError(
        409,
        'issuance_intent_signature_mismatch'
      );
    }

    if (
      initialIntent.mint_address !==
      MEGY_MAINNET_MINT
    ) {
      throw new ApiError(
        409,
        'issuance_mint_mismatch'
      );
    }

    if (
      initialIntent.fee_payer_wallet !==
      MEGY_MINT_AUTHORITY
    ) {
      throw new ApiError(
        409,
        'issuance_fee_payer_mismatch'
      );
    }

    const mintType =
      parseMintType(
        initialIntent.mint_type
      );

    const expectedDestination =
      BUCKETS[mintType];

    if (
      initialIntent.destination_wallet !==
      expectedDestination
    ) {
      throw new ApiError(
        409,
        'issuance_destination_mismatch'
      );
    }

    if (
      !initialIntent
        .prepared_transaction_base64
    ) {
      throw new ApiError(
        409,
        'prepared_transaction_missing'
      );
    }

    let preparedTransaction:
      Transaction;

    try {
      preparedTransaction =
        Transaction.from(
          Buffer.from(
            initialIntent
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
     * Ask Solana for the confirmed transaction.
     *
     * If it has not appeared yet, we do NOT change the
     * broadcast intent. The reservation remains active.
     */
    const connection =
      new Connection(
        getServerRpcUrl(),
        {
          commitment: 'confirmed',
        }
      );

    const chainTx =
      await connection.getTransaction(
        txSignature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }
      );

    if (!chainTx) {
      /*
       * It may simply not be indexed/confirmed yet.
       *
       * Keeping the intent in broadcast state is essential:
       * we must not release capacity while the chain outcome
       * may still be uncertain.
       */
      return NextResponse.json(
        {
          success: false,
          pending: true,
          error:
            'transaction_not_confirmed_yet',

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
     * The first signature belongs to the fee payer.
     *
     * In our issuance architecture:
     *
     * fee payer = Mint Authority = 42Ms...
     *
     * Therefore this must be the exact signature supplied by
     * /broadcast.
     */
    const chainSignatures =
      chainTx.transaction.signatures;

    if (
      chainSignatures.length !== 1 ||
      chainSignatures[0] !== txSignature
    ) {
      throw new ApiError(
        409,
        'onchain_signature_mismatch'
      );
    }

    /*
     * The chain message must be byte-for-byte identical to the
     * transaction prepared by our server.
     *
     * This implicitly verifies:
     *
     * - fee payer
     * - recent blockhash
     * - MEGY mint
     * - destination ATA
     * - exact base-unit amount
     * - Mint Authority
     * - ATA creation instruction, if any
     * - issuance intent memo
     */
    const chainMessageBytes =
      chainTx.transaction.message.serialize();

    if (
      !messagesEqual(
        preparedTransaction,
        chainMessageBytes
      )
    ) {
      throw new ApiError(
        409,
        'onchain_transaction_message_mismatch'
      );
    }

    /*
    * Never finalize an issuance without transaction metadata.
    *
    * A missing meta object means we cannot prove successful
    * execution yet, even if the transaction itself is visible.
    */
    if (!chainTx.meta) {
        return NextResponse.json(
        {
            success: false,
            pending: true,
            error: 'transaction_meta_unavailable',
    
            intentId,
            txSignature,
    
            status: 'broadcast',
        },
        {
            status: 202,
            headers: {
            'Cache-Control': 'no-store',
            },
        }
        );
    }

    /*
     * A transaction present on-chain with meta.err != null is a
     * definitive failed execution.
     *
     * Unlike an uncertain RPC error, this transaction cannot
     * later turn into a successful mint.
     */
    if (chainTx.meta.err) {
      await runTransaction(
        pool,
        [
          `megy-issuance-intent:${intentId}`,
        ],
        async (client) => {
          const locked =
            await client.query(
              `
                SELECT
                  id,
                  status,
                  tx_signature

                FROM public.megy_issuance_intents

                WHERE id = $1::bigint

                FOR UPDATE
              `,
              [intentId]
            );

          const intent =
            locked.rows[0];

          if (!intent) {
            throw new ApiError(
              404,
              'issuance_intent_not_found'
            );
          }

          /*
           * Never downgrade a transaction already recorded as
           * completed.
           */
          if (
            intent.status === 'completed'
          ) {
            return;
          }

          if (
            intent.status !== 'broadcast' ||
            intent.tx_signature !==
              txSignature
          ) {
            throw new ApiError(
              409,
              'issuance_intent_state_conflict'
            );
          }

          await client.query(
            `
              UPDATE public.megy_issuance_intents

              SET
                status = 'failed',
                updated_at = now()

              WHERE id = $1::bigint
                AND status = 'broadcast'
                AND tx_signature = $2
            `,
            [
              intentId,
              txSignature,
            ]
          );
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'onchain_transaction_failed',

          intentId,
          txSignature,

          status: 'failed',

          slot: chainTx.slot,
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
     * Only a successful, confirmed, exact transaction reaches
     * the accounting finalization below.
     */
    const finalization =
      await runTransaction(
        pool,
        [
            `megy-issuance-intent:${intentId}`,
            `megy-issuance-ledger:${String(
              initialIntent.issuance_ledger_id
            )}`,
        ],
        async (client) => {
          /*
           * Lock the issuance ledger first.
           *
           * This serializes economic finalization and matches
           * the locking discipline used by our DB capacity
           * guards.
           */

          const lockedResult =
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
                  tx_signature,
                  completed_at

                FROM public.megy_issuance_intents

                WHERE id = $1::bigint

                FOR UPDATE
              `,
              [intentId]
            );

          const intent =
            lockedResult.rows[0];

          if (!intent) {
            throw new ApiError(
              404,
              'issuance_intent_not_found'
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
              [
                String(
                  initialIntent
                    .issuance_ledger_id
                ),
              ]
            );

          if (
            ledgerResult.rowCount !== 1
          ) {
            throw new ApiError(
              409,
              'issuance_ledger_missing'
            );
          }

          /*
           * Revalidate all economic fields after taking the DB
           * locks. We never rely solely on the earlier,
           * pre-chain-verification snapshot.
           */
          if (
            String(
              intent
                .issuance_ledger_id
            ) !==
            String(
              initialIntent
                .issuance_ledger_id
            ) ||
            intent.mint_type !==
              initialIntent.mint_type ||
            intent.amount_base !==
              initialIntent.amount_base ||
            intent.mint_address !==
              MEGY_MAINNET_MINT ||
            intent.destination_wallet !==
              expectedDestination ||
            intent.fee_payer_wallet !==
              MEGY_MINT_AUTHORITY
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
           * Check whether this signature was already written to
           * the append-only mint ledger.
           *
           * This makes /confirm safe to retry after a network
           * failure between the server and browser.
           */
          const existingEventResult =
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
                  tx_signature,
                  network,
                  created_by,
                  created_at

                FROM public.megy_mint_events

                WHERE tx_signature = $1

                LIMIT 1
              `,
              [txSignature]
            );

          const existingEvent =
            existingEventResult.rows[0];

          if (existingEvent) {
            /*
             * A duplicate signature is accepted only when it is
             * economically identical to this intent.
             */
            if (
              String(
                existingEvent
                  .issuance_ledger_id
              ) !==
                String(
                  intent
                    .issuance_ledger_id
                ) ||
              existingEvent.mint_type !==
                intent.mint_type ||
              existingEvent.amount_base !==
                intent.amount_base ||
              existingEvent.mint_address !==
                intent.mint_address ||
              existingEvent
                .destination_wallet !==
                intent.destination_wallet
            ) {
              throw new ApiError(
                409,
                'mint_event_signature_conflict'
              );
            }

            /*
             * Recovery path:
             *
             * If the append-only event already exists but the
             * intent somehow remained broadcast, safely finish
             * the intent without minting or inserting again.
             */
            if (
              intent.status ===
              'broadcast'
            ) {
              const recovered =
                await client.query(
                  `
                    UPDATE public.megy_issuance_intents

                    SET
                      status = 'completed',
                      completed_at =
                        COALESCE(
                          completed_at,
                          now()
                        ),
                      updated_at = now()

                    WHERE id = $1::bigint
                      AND status = 'broadcast'
                      AND tx_signature = $2

                    RETURNING id
                  `,
                  [
                    intentId,
                    txSignature,
                  ]
                );

              if (
                recovered.rowCount !== 1
              ) {
                throw new ApiError(
                  409,
                  'issuance_intent_recovery_failed'
                );
              }
            } else if (
              intent.status !==
              'completed'
            ) {
              throw new ApiError(
                409,
                'issuance_intent_state_conflict'
              );
            }

            return {
              alreadyConfirmed: true,
              mintEventId:
                String(
                  existingEvent.id
                ),
              completedAt:
                intent.completed_at
                  ? new Date(
                      intent.completed_at
                    ).toISOString()
                  : null,
            };
          }

          if (
            intent.status ===
            'completed'
          ) {
            /*
             * completed without its matching append-only event
             * is an invariant violation. Never silently create
             * a new accounting record here.
             */
            throw new ApiError(
              500,
              'completed_intent_missing_mint_event'
            );
          }

          if (
            intent.status !==
            'broadcast'
          ) {
            throw new ApiError(
              409,
              'issuance_intent_not_broadcast'
            );
          }

          /*
           * Record the successful on-chain issuance.
           *
           * The existing BEFORE INSERT capacity trigger on
           * megy_mint_events independently enforces the
           * authorized bucket ceiling.
           */
          const eventResult =
            await client.query(
              `
                INSERT INTO public.megy_mint_events (
                  issuance_ledger_id,
                  mint_type,
                  amount_base,
                  mint_address,
                  destination_wallet,
                  tx_signature,
                  network,
                  created_by,
                  note
                )
                VALUES (
                  $1::bigint,
                  $2,
                  $3::numeric,
                  $4,
                  $5,
                  $6,
                  'solana-mainnet',
                  $7,
                  $8
                )

                RETURNING
                  id,
                  created_at
              `,
              [
                String(
                  intent
                    .issuance_ledger_id
                ),
                intent.mint_type,
                intent.amount_base,
                intent.mint_address,
                intent.destination_wallet,
                txSignature,
                intent.created_by,
                `MEGY issuance intent ${intentId}`,
              ]
            );

          const mintEvent =
            eventResult.rows[0];

          if (!mintEvent?.id) {
            throw new ApiError(
              500,
              'mint_event_insert_failed'
            );
          }

          /*
           * The event insert and the intent completion live in
           * the SAME PostgreSQL transaction.
           *
           * Either both commit or neither commits.
           */
          const completedResult =
            await client.query(
              `
                UPDATE public.megy_issuance_intents

                SET
                  status = 'completed',
                  completed_at = now(),
                  updated_at = now()

                WHERE id = $1::bigint
                  AND status = 'broadcast'
                  AND tx_signature = $2

                RETURNING
                  id,
                  completed_at
              `,
              [
                intentId,
                txSignature,
              ]
            );

          if (
            completedResult.rowCount !== 1
          ) {
            throw new ApiError(
              409,
              'issuance_intent_completion_failed'
            );
          }

          return {
            alreadyConfirmed: false,

            mintEventId:
              String(mintEvent.id),

            completedAt:
              new Date(
                completedResult
                  .rows[0]
                  .completed_at
              ).toISOString(),
          };
        }
      );

    return NextResponse.json(
      {
        success: true,

        status: 'completed',

        alreadyConfirmed:
          finalization
            .alreadyConfirmed,

        intentId,

        txSignature,

        mintEventId:
          finalization.mintEventId,

        issuance: {
          issuanceLedgerId:
            String(
              initialIntent
                .issuance_ledger_id
            ),

          mintType,

          amountBase:
            String(
              initialIntent
                .amount_base
            ),

          mintAddress:
            MEGY_MAINNET_MINT,

          destinationWallet:
            expectedDestination,
        },

        chain: {
          slot:
            chainTx.slot,

          blockTime:
            chainTx.blockTime
              ? new Date(
                  chainTx.blockTime *
                    1000
                ).toISOString()
              : null,

          confirmation:
            'confirmed',
        },

        completedAt:
          finalization.completedAt,
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
      '[MEGY_ISSUANCE_CONFIRM] failed:',
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
          'megy_issuance_confirm_failed',
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