// app/api/admin/megy-issuance/prepare/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';

import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEGY_MAINNET_MINT =
    '7nJZvQZjt4XtTdti2mQMxboDvo93h23MUDDDX7EPzWwT';

const MEGY_MINT_AUTHORITY =
    '42MsfyA39M8Dr3JFaf91zjyNg7V4XVUNVPKSbRaL4cfB';

const MEGY_DECIMALS = 9;

/**
 * Solana Mainnet-Beta genesis hash.
 *
 * Issuance must NEVER prepare a transaction against
 * devnet, testnet, or an incorrectly configured RPC.
 */
const SOLANA_MAINNET_GENESIS_HASH =
    '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const INTENT_TTL_MINUTES = 15;

/**
 * Solana Memo program.
 *
 * We bind every prepared transaction to its DB issuance intent.
 */
const MEMO_PROGRAM_ID = new PublicKey(
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

const BUCKETS = {
    coincarnation: {
        destinationWallet:
            '5xsUuakT88bUeU9WBn1iyHwqSKbj5b7m5Fms89gqqD7d',
        remainingColumn: 'coincarnation_remaining_base',
    },

    partnerships_ecosystem_growth: {
        destinationWallet:
            '6rUaTU9JhsKrMMnrUfcgEozzMpn6DCzDh4FWYRTWbP9K',
        remainingColumn: 'partnerships_remaining_base',
    },

    fair_future_fund_reserve: {
        destinationWallet:
            '5vHvG6mbabynm21vUUrJQz9DSkBDRWgMha7w7tJ4kufz',
        remainingColumn: 'fff_remaining_base',
    },

    liquidity: {
        destinationWallet:
            'DvMQnxDYUTn2DjhzK1KXJHfGKcsPRxeYf1fyKDidM9TF',
        remainingColumn: 'liquidity_remaining_base',
    },

    team_contributors: {
        destinationWallet:
            '4Hysbg28nPdqpeaqjJ6Z9XMSX89f9oJXeWMv8iUuWX9z',
        remainingColumn: 'team_remaining_base',
    },
} as const;

type MintType = keyof typeof BUCKETS;

type PrepareBody = {
    issuanceLedgerId?: unknown;
    mintType?: unknown;
    amountBase?: unknown;
};

function getServerRpcUrl(): string {
    const value =
        process.env.SOLANA_RPC_URL?.trim() ||
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

    if (!value) {
        throw new Error('Missing Solana RPC URL');
    }

    return value;
}

function parsePositiveIntegerString(
    value: unknown,
    fieldName: string
): string {
    const raw = String(value ?? '').trim();

    if (!/^\d+$/.test(raw)) {
        throw new Error(`${fieldName} must be a positive integer string`);
    }

    const parsed = BigInt(raw);

    if (parsed <= 0n) {
        throw new Error(`${fieldName} must be greater than zero`);
    }

    return parsed.toString();
}

function parseLedgerId(value: unknown): string {
    const raw = String(value ?? '').trim();

    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
        throw new Error('Invalid issuanceLedgerId');
    }

    return raw;
}

function parseMintType(value: unknown): MintType {
    const raw = String(value ?? '').trim();

    if (!(raw in BUCKETS)) {
        throw new Error('Invalid mintType');
    }

    return raw as MintType;
}

function serializeUnsignedTransaction(
    tx: Transaction
): string {
    return tx
        .serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        })
        .toString('base64');
}

export async function POST(req: NextRequest) {
    let intentId: string | null = null;

    try {
        /*
         * Mutation endpoint:
         * CSRF + current admin authorization are both mandatory.
         */
        verifyCsrf(req as any);

        const adminWallet = await requireAdmin(req);

        let body: PrepareBody;

        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error: 'invalid_json',
                },
                { status: 400 }
            );
        }

        const issuanceLedgerId =
            parseLedgerId(body.issuanceLedgerId);

        const mintType =
            parseMintType(body.mintType);

        const amountBase =
            parsePositiveIntegerString(
                body.amountBase,
                'amountBase'
            );

        const amountBaseBigInt = BigInt(amountBase);

        const bucket = BUCKETS[mintType];

        /*
         * The readiness view contains only:
         *
         * - production phases
         * - snapshot-complete phases
         * - finalized phases
         *
         * Therefore a missing row is not issuance-ready.
         */
        const readinessRows = (await sql`
      SELECT
        issuance_ledger_id,
        phase_id,
        phase_no,
        issuance_status,

        coincarnation_remaining_base,
        partnerships_remaining_base,
        fff_remaining_base,
        liquidity_remaining_base,
        team_remaining_base

      FROM public.megy_issuance_readiness

      WHERE issuance_ledger_id = ${issuanceLedgerId}::bigint

      LIMIT 1
    `) as any[];

        const readiness = readinessRows[0];

        if (!readiness) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'issuance_not_ready',
                },
                { status: 404 }
            );
        }

        const remainingRaw =
            readiness[bucket.remainingColumn];

        const remainingBase =
            BigInt(String(remainingRaw ?? '0'));

        if (remainingBase <= 0n) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'no_remaining_capacity',
                },
                { status: 409 }
            );
        }

        if (amountBaseBigInt > remainingBase) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'amount_exceeds_remaining_capacity',
                    remainingBase: remainingBase.toString(),
                },
                { status: 409 }
            );
        }

        const mintPublicKey =
            new PublicKey(MEGY_MAINNET_MINT);

        const mintAuthorityPublicKey =
            new PublicKey(MEGY_MINT_AUTHORITY);

        const destinationWallet =
            new PublicKey(bucket.destinationWallet);

        /*
         * The Ledger Mint Authority is BOTH:
         *
         * - transaction fee payer
         * - SPL MintTo authority
         *
         * Therefore only one Solana signer is required.
         */
        const feePayerPublicKey =
            mintAuthorityPublicKey;

        const connection = new Connection(
            getServerRpcUrl(),
            {
                commitment: 'confirmed',
            }
        );

        /*
        * HARD MAINNET GUARD
        *
        * MEGY issuance is permanently mainnet-only.
        *
        * Do not trust the RPC URL name or environment configuration.
        * Ask the connected Solana cluster for its genesis hash and
        * require the canonical Mainnet-Beta value before creating
        * any issuance intent or preparing any transaction.
        */
        const genesisHash =
            await connection.getGenesisHash();

        if (
            genesisHash !==
            SOLANA_MAINNET_GENESIS_HASH
        ) {
            throw new Error(
                `MEGY issuance requires Solana Mainnet-Beta; RPC genesis hash mismatch: ${genesisHash}`
            );
        }

        /*
        * Validate the permanent MEGY mint account before reserving
        * economic capacity.
        */
        const mintInfo =
            await connection.getParsedAccountInfo(
                mintPublicKey,
                'confirmed'
            );

        if (!mintInfo.value) {
            throw new Error('MEGY mint account not found');
        }

        if (
            !mintInfo.value.owner.equals(
                TOKEN_PROGRAM_ID
            )
        ) {
            throw new Error(
                'MEGY mint is not owned by the Original SPL Token program'
            );
        }

        const parsedMintData =
            (mintInfo.value.data as any)?.parsed?.info;

        if (!parsedMintData) {
            throw new Error(
                'Unable to parse MEGY mint account'
            );
        }

        if (
            Number(parsedMintData.decimals) !==
            MEGY_DECIMALS
        ) {
            throw new Error(
                'MEGY mint decimals mismatch'
            );
        }

        if (
            String(parsedMintData.mintAuthority) !==
            MEGY_MINT_AUTHORITY
        ) {
            throw new Error(
                'MEGY mint authority mismatch'
            );
        }

        /*
         * Treasury destination is never accepted from the client.
         * It is derived exclusively from the selected mint type.
         */
        const destinationAta =
            getAssociatedTokenAddressSync(
                mintPublicKey,
                destinationWallet,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

        const destinationAtaInfo =
            await connection.getAccountInfo(
                destinationAta,
                'confirmed'
            );

        if (destinationAtaInfo) {
            if (
                !destinationAtaInfo.owner.equals(
                    TOKEN_PROGRAM_ID
                )
            ) {
                throw new Error(
                    'Destination ATA has an unexpected program owner'
                );
            }

            const destinationTokenAccount =
                await getAccount(
                    connection,
                    destinationAta,
                    'confirmed',
                    TOKEN_PROGRAM_ID
                );

            if (
                !destinationTokenAccount.mint.equals(
                    mintPublicKey
                )
            ) {
                throw new Error(
                    'Destination ATA mint mismatch'
                );
            }

            if (
                !destinationTokenAccount.owner.equals(
                    destinationWallet
                )
            ) {
                throw new Error(
                    'Destination ATA wallet owner mismatch'
                );
            }
        }

        const expiresAtRows = (await sql`
      SELECT
        now() + (${INTENT_TTL_MINUTES} * interval '1 minute')
          AS expires_at
    `) as any[];

        const expiresAt =
            expiresAtRows[0]?.expires_at;

        if (!expiresAt) {
            throw new Error(
                'Unable to calculate issuance intent expiry'
            );
        }

        /*
         * INSERTING the intent is the actual capacity reservation.
         *
         * The DB trigger locks the issuance ledger row and rejects
         * concurrent reservations that would exceed capacity.
         */
        const insertedRows = (await sql`
      INSERT INTO public.megy_issuance_intents (
        issuance_ledger_id,
        mint_type,
        amount_base,
        mint_address,
        destination_wallet,
        fee_payer_wallet,
        created_by,
        status,
        expires_at
      )
      VALUES (
        ${issuanceLedgerId}::bigint,
        ${mintType},
        ${amountBase}::numeric,
        ${MEGY_MAINNET_MINT},
        ${bucket.destinationWallet},
        ${MEGY_MINT_AUTHORITY},
        ${adminWallet},
        'reserved',
        ${expiresAt}
      )
      RETURNING
        id,
        expires_at
    `) as any[];

        const inserted = insertedRows[0];

        if (!inserted?.id) {
            throw new Error(
                'Failed to create issuance intent'
            );
        }

        intentId = String(inserted.id);

        /*
         * Build the transaction only AFTER the capacity reservation
         * succeeds.
         */
        const latest =
            await connection.getLatestBlockhash(
                'confirmed'
            );

        const tx = new Transaction();

        tx.feePayer = feePayerPublicKey;
        tx.recentBlockhash = latest.blockhash;

        /*
         * Create the destination ATA only when it does not exist.
         *
         * Because the Ledger Mint Authority is also fee payer,
         * that same Ledger account pays the ATA creation rent.
         */
        if (!destinationAtaInfo) {
            tx.add(
                createAssociatedTokenAccountInstruction(
                    feePayerPublicKey,
                    destinationAta,
                    destinationWallet,
                    mintPublicKey,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                )
            );
        }

        /*
         * Bind the chain transaction to the DB intent.
         *
         * The confirm endpoint will later verify this memo.
         */
        tx.add(
            new TransactionInstruction({
                programId: MEMO_PROGRAM_ID,
                keys: [],
                data: Buffer.from(
                    `MEGY_ISSUANCE_INTENT:${intentId}`,
                    'utf8'
                ),
            })
        );

        /*
         * Exact base-unit mint.
         *
         * No floating point math is used.
         */
        tx.add(
            createMintToInstruction(
                mintPublicKey,
                destinationAta,
                mintAuthorityPublicKey,
                amountBaseBigInt,
                [],
                TOKEN_PROGRAM_ID
            )
        );

        const transactionBase64 =
            serializeUnsignedTransaction(tx);

        /*
         * Store exactly what was prepared.
         *
         * This gives us an audit/recovery anchor before anything is
         * signed or sent to Solana.
         */
        const preparedRows = (await sql`
      UPDATE public.megy_issuance_intents

      SET
        status = 'prepared',
        recent_blockhash = ${latest.blockhash},
        last_valid_block_height =
          ${latest.lastValidBlockHeight}::bigint,
        prepared_transaction_base64 =
          ${transactionBase64},
        updated_at = now()

      WHERE id = ${intentId}::bigint
        AND status = 'reserved'
        AND expires_at > now()

      RETURNING
        id,
        status,
        expires_at
    `) as any[];

        if (preparedRows.length !== 1) {
            throw new Error(
                'Failed to finalize prepared issuance intent'
            );
        }

        return NextResponse.json(
            {
                success: true,

                intent: {
                    id: intentId,
                    status: 'prepared',
                    expiresAt: new Date(
                        preparedRows[0].expires_at
                    ).toISOString(),
                },

                issuance: {
                    issuanceLedgerId,
                    phaseId: String(
                        readiness.phase_id
                    ),
                    phaseNo: readiness.phase_no,
                    mintType,
                    amountBase,
                    remainingBase:
                        remainingBase.toString(),
                },

                transaction: {
                    serializedBase64:
                        transactionBase64,

                    recentBlockhash:
                        latest.blockhash,

                    lastValidBlockHeight:
                        latest.lastValidBlockHeight,

                    feePayer:
                        MEGY_MINT_AUTHORITY,

                    requiredSigner:
                        MEGY_MINT_AUTHORITY,
                },

                megy: {
                    mintAddress:
                        MEGY_MAINNET_MINT,
                    decimals:
                        MEGY_DECIMALS,
                    mintAuthority:
                        MEGY_MINT_AUTHORITY,
                },

                destination: {
                    wallet:
                        bucket.destinationWallet,
                    ata:
                        destinationAta.toBase58(),
                    ataWillBeCreated:
                        !destinationAtaInfo,
                },
            },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (e: unknown) {
        /*
         * If an intent was reserved but preparation subsequently failed,
         * release the reservation immediately rather than waiting for TTL.
         */
        if (intentId) {
            try {
                await sql`
          UPDATE public.megy_issuance_intents

          SET
            status = 'failed',
            updated_at = now()

          WHERE id = ${intentId}::bigint
            AND status IN ('reserved', 'prepared')
        `;
            } catch (cleanupError) {
                console.error(
                    '[megy-issuance/prepare] intent cleanup failed',
                    cleanupError
                );
            }
        }

        console.error(
            '[megy-issuance/prepare] failed',
            e
        );

        const { status, body } =
            httpErrorFrom(e, 500);

        return NextResponse.json(
            body,
            {
                status,
                headers: {
                    'Cache-Control': 'no-store',
                },
            }
        );
    }
}