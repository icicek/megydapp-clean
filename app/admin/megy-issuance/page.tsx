//app/admin/megy-issuance/page.tsx

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
    PublicKey,
    Transaction,
} from '@solana/web3.js';

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    decodeMintToInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const CARD =
    'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm';

const MEGY_MINT_AUTHORITY =
    '42MsfyA39M8Dr3JFaf91zjyNg7V4XVUNVPKSbRaL4cfB';

const MEGY_MAINNET_MINT =
    '7nJZvQZjt4XtTdti2mQMxboDvo93h23MUDDDX7EPzWwT';

const MEMO_PROGRAM_ID =
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

type BucketKey =
    | 'coincarnation'
    | 'partnershipsEcosystemGrowth'
    | 'fairFutureFundReserve'
    | 'liquidity'
    | 'teamContributors';

type BucketMintType =
    | 'coincarnation'
    | 'partnerships_ecosystem_growth'
    | 'fair_future_fund_reserve'
    | 'liquidity'
    | 'team_contributors';

type BucketDestination = {
    mintType: BucketMintType;
    label: string;
    destinationWallet: string;
};

type LedgerBucket = {
    mintType: BucketMintType;
    label: string;
    destinationWallet: string;
    authorizedBase: string;
    mintedBase: string;
    remainingBase: string;
};

type IssuanceLedger = {
    issuanceLedgerId: string;
    phaseId: string;
    phaseNo: number | null;
    phaseName: string | null;
    finalizedAt: string | null;
    tokenomicsVersion: string | null;
    issuanceStatus: string | null;

    buckets: Record<BucketKey, LedgerBucket>;

    totals: {
        ecosystemAuthorizedBase: string;
        authorizedBase: string;
        mintedBase: string;
        remainingBase: string;
    };
};

type MintEvent = {
    id: string;
    issuanceLedgerId: string;
    mintType: string;
    amountBase: string;
    mintAddress: string;
    destinationWallet: string;
    txSignature: string;
    network: string | null;
    createdBy: string | null;
    note: string | null;
    createdAt: string | null;
};

type PrepareIssuanceResponse = {
    success: boolean;

    intent: {
        id: string;
        status: 'prepared';
        expiresAt: string;
    };

    issuance: {
        issuanceLedgerId: string;
        phaseId: string;
        phaseNo: number | null;
        mintType: BucketMintType;
        amountBase: string;
        remainingBase: string;
    };

    transaction: {
        serializedBase64: string;
        recentBlockhash: string;
        lastValidBlockHeight: number;
        feePayer: string;
        requiredSigner: string;
    };

    megy: {
        mintAddress: string;
        decimals: number;
        mintAuthority: string;
    };

    destination: {
        wallet: string;
        ata: string;
        ataWillBeCreated: boolean;
    };

    error?: string;
};

type PreparedTransactionVerification = {
    valid: boolean;
    error: string | null;
};

type OverviewResponse = {
    success: boolean;

    megy: {
        network: string;
        program: string;
        mintAddress: string;
        decimals: number;
        mintAuthority: string;
        feePayer: {
            wallet: string;
            mode: string;
        };
    };

    operator: {
        adminWallet: string;
    };

    bucketDestinations: Record<
        BucketKey,
        BucketDestination
    >;

    ledgers: IssuanceLedger[];
    recentMintEvents: MintEvent[];

    error?: string;
};

const BUCKET_ORDER: Array<{
    key: BucketKey;
    label: string;
}> = [
        {
            key: 'coincarnation',
            label: 'Coincarnation Rewards',
        },
        {
            key: 'partnershipsEcosystemGrowth',
            label: 'Partnerships & Ecosystem Growth',
        },
        {
            key: 'fairFutureFundReserve',
            label: 'Fair Future Fund Reserve',
        },
        {
            key: 'liquidity',
            label: 'Liquidity',
        },
        {
            key: 'teamContributors',
            label: 'Team & Contributors',
        },
    ];

function shortAddress(
    value?: string | null
): string {
    const v = String(value ?? '').trim();

    if (!v) return '-';
    if (v.length <= 16) return v;

    return `${v.slice(0, 7)}…${v.slice(-7)}`;
}

function formatDate(
    value?: string | null
): string {
    if (!value) return '-';

    try {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString();
    } catch {
        return String(value);
    }
}

function formatBaseUnits(
    value: unknown,
    decimals = 9
): string {
    const raw = String(value ?? '0').trim();

    if (!/^-?\d+$/.test(raw)) return '-';

    try {
        const negative = raw.startsWith('-');

        const digits = negative
            ? raw.slice(1)
            : raw;

        if (decimals === 0) {
            const formatted =
                BigInt(digits || '0').toLocaleString();

            return negative
                ? `-${formatted}`
                : formatted;
        }

        const padded = digits.padStart(
            decimals + 1,
            '0'
        );

        const whole =
            padded.slice(0, -decimals) || '0';

        const fraction = padded
            .slice(-decimals)
            .replace(/0+$/, '');

        const wholeFormatted =
            BigInt(whole).toLocaleString();

        const result =
            fraction.length > 0
                ? `${wholeFormatted}.${fraction}`
                : wholeFormatted;

        return negative
            ? `-${result}`
            : result;
    } catch {
        return '-';
    }
}

function parseMegyAmountToBaseUnits(
    value: string,
    decimals: number
): bigint | null {
    const normalized = value.trim();

    if (!normalized) return null;

    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
        return null;
    }

    const [wholePart, fractionPart = ''] =
        normalized.split('.');

    if (fractionPart.length > decimals) {
        return null;
    }

    try {
        const scale = 10n ** BigInt(decimals);

        const wholeBase =
            BigInt(wholePart || '0') * scale;

        const fractionBase =
            decimals === 0
                ? 0n
                : BigInt(
                    fractionPart.padEnd(decimals, '0') ||
                    '0'
                );

        return wholeBase + fractionBase;
    } catch {
        return null;
    }
}

function percentageOfBaseUnits(
    remainingBase: string,
    percent: 25 | 50 | 100,
    decimals: number
): string {
    try {
        const remaining = BigInt(remainingBase);

        if (remaining <= 0n) {
            return '';
        }

        const amount =
            percent === 100
                ? remaining
                : (remaining * BigInt(percent)) / 100n;

        return amount > 0n
            ? formatBaseUnits(amount.toString(), decimals)
                .replace(/,/g, '')
            : '';
    } catch {
        return '';
    }
}

function verifyPreparedTransactionStructure(
    prepared: PrepareIssuanceResponse
): PreparedTransactionVerification {
    try {
        const raw = Buffer.from(
            prepared.transaction.serializedBase64,
            'base64'
        );

        const transaction = Transaction.from(raw);

        if (!transaction.feePayer) {
            throw new Error(
                'Prepared transaction has no fee payer.'
            );
        }

        if (
            transaction.feePayer.toBase58() !==
            MEGY_MINT_AUTHORITY
        ) {
            throw new Error(
                'Prepared transaction fee payer mismatch.'
            );
        }

        if (
            transaction.recentBlockhash !==
            prepared.transaction.recentBlockhash
        ) {
            throw new Error(
                'Prepared transaction blockhash mismatch.'
            );
        }

        if (
            prepared.transaction.requiredSigner !==
            MEGY_MINT_AUTHORITY
        ) {
            throw new Error(
                'Prepared transaction required signer mismatch.'
            );
        }

        if (prepared.megy.decimals !== 9) {
            throw new Error(
                'Prepared transaction MEGY decimals mismatch.'
            );
        }

        if (
            prepared.megy.mintAddress !==
            MEGY_MAINNET_MINT
        ) {
            throw new Error(
                'Prepared transaction MEGY mint mismatch.'
            );
        }

        if (
            prepared.megy.mintAuthority !==
            MEGY_MINT_AUTHORITY
        ) {
            throw new Error(
                'Prepared transaction mint authority mismatch.'
            );
        }

        const allowedPrograms = new Set([
            TOKEN_PROGRAM_ID.toBase58(),
            ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
            MEMO_PROGRAM_ID,
        ]);

        for (const instruction of transaction.instructions) {
            const programId =
                instruction.programId.toBase58();

            if (!allowedPrograms.has(programId)) {
                throw new Error(
                    `Unexpected program in prepared transaction: ${programId}`
                );
            }
        }

        const memoInstructions =
            transaction.instructions.filter(
                (instruction) =>
                    instruction.programId.toBase58() ===
                    MEMO_PROGRAM_ID
            );

        if (memoInstructions.length !== 1) {
            throw new Error(
                'Prepared transaction must contain exactly one issuance memo.'
            );
        }

        const expectedMemo =
            `MEGY_ISSUANCE_INTENT:${prepared.intent.id}`;

        const actualMemo =
            Buffer.from(
                memoInstructions[0].data
            ).toString('utf8');

        if (actualMemo !== expectedMemo) {
            throw new Error(
                'Prepared transaction issuance intent memo mismatch.'
            );
        }

        const tokenInstructions =
            transaction.instructions.filter(
                (instruction) =>
                    instruction.programId.equals(
                        TOKEN_PROGRAM_ID
                    )
            );

        if (tokenInstructions.length !== 1) {
            throw new Error(
                'Prepared transaction must contain exactly one SPL Token instruction.'
            );
        }

        const mintToInstruction =
            decodeMintToInstruction(
                tokenInstructions[0],
                TOKEN_PROGRAM_ID
            );

        if (
            mintToInstruction.keys.mint.pubkey.toBase58() !==
            MEGY_MAINNET_MINT
        ) {
            throw new Error(
                'MintTo mint account mismatch.'
            );
        }

        if (
            mintToInstruction.keys.destination.pubkey.toBase58() !==
            prepared.destination.ata
        ) {
            throw new Error(
                'MintTo destination ATA mismatch.'
            );
        }

        if (
            mintToInstruction.keys.authority.pubkey.toBase58() !==
            MEGY_MINT_AUTHORITY
        ) {
            throw new Error(
                'MintTo authority mismatch.'
            );
        }

        const expectedAmount =
            BigInt(prepared.issuance.amountBase);

        if (
            mintToInstruction.data.amount !==
            expectedAmount
        ) {
            throw new Error(
                'MintTo amount mismatch.'
            );
        }

        const expectedDestinationAta =
            getAssociatedTokenAddressSync(
                new PublicKey(MEGY_MAINNET_MINT),
                new PublicKey(
                    prepared.destination.wallet
                ),
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

        if (
            expectedDestinationAta.toBase58() !==
            prepared.destination.ata
        ) {
            throw new Error(
                'Prepared destination ATA does not match the canonical MEGY ATA.'
            );
        }

        const ataInstructions =
            transaction.instructions.filter(
                (instruction) =>
                    instruction.programId.equals(
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
            );

        const expectedAtaInstructionCount =
            prepared.destination.ataWillBeCreated
                ? 1
                : 0;

        if (
            ataInstructions.length !==
            expectedAtaInstructionCount
        ) {
            throw new Error(
                'Prepared transaction ATA creation structure mismatch.'
            );
        }

        if (prepared.destination.ataWillBeCreated) {
            const ataInstruction = ataInstructions[0];

            if (ataInstruction.keys.length < 4) {
                throw new Error(
                    'Prepared ATA creation instruction is malformed.'
                );
            }

            const ataPayer =
                ataInstruction.keys[0].pubkey.toBase58();

            const ataAddress =
                ataInstruction.keys[1].pubkey.toBase58();

            const ataOwner =
                ataInstruction.keys[2].pubkey.toBase58();

            const ataMint =
                ataInstruction.keys[3].pubkey.toBase58();

            if (ataPayer !== MEGY_MINT_AUTHORITY) {
                throw new Error(
                    'Prepared ATA payer mismatch.'
                );
            }

            if (
                ataAddress !==
                expectedDestinationAta.toBase58()
            ) {
                throw new Error(
                    'Prepared ATA address mismatch.'
                );
            }

            if (
                ataOwner !==
                prepared.destination.wallet
            ) {
                throw new Error(
                    'Prepared ATA owner mismatch.'
                );
            }

            if (ataMint !== MEGY_MAINNET_MINT) {
                throw new Error(
                    'Prepared ATA mint mismatch.'
                );
            }
        }

        return {
            valid: true,
            error: null,
        };
    } catch (error: unknown) {
        return {
            valid: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Prepared transaction verification failed.',
        };
    }
}

function verifySignedPreparedTransaction(
    prepared: PrepareIssuanceResponse,
    signedTransaction: Transaction
): PreparedTransactionVerification {
    try {
        /*
         * First verify the transaction's economic and structural
         * contents using exactly the same checks performed before
         * signing.
         */
        const serializedSignedTransaction =
            signedTransaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            });

        const signedPrepared: PrepareIssuanceResponse = {
            ...prepared,
            transaction: {
                ...prepared.transaction,
                serializedBase64:
                    serializedSignedTransaction.toString(
                        'base64'
                    ),
            },
        };

        const structureVerification =
            verifyPreparedTransactionStructure(
                signedPrepared
            );

        if (!structureVerification.valid) {
            throw new Error(
                structureVerification.error ||
                'Signed transaction structure verification failed.'
            );
        }

        /*
         * Signing must not mutate the transaction message.
         */
        const originalTransaction = Transaction.from(
            Buffer.from(
                prepared.transaction.serializedBase64,
                'base64'
            )
        );

        const originalMessage =
            originalTransaction
                .serializeMessage()
                .toString('base64');

        const signedMessage =
            signedTransaction
                .serializeMessage()
                .toString('base64');

        if (signedMessage !== originalMessage) {
            throw new Error(
                'Wallet modified the prepared transaction message.'
            );
        }

        /*
         * The transaction must contain the MEGY Mint Authority
         * signature.
         */
        const mintAuthoritySignature =
            signedTransaction.signatures.find(
                (entry) =>
                    entry.publicKey.toBase58() ===
                    MEGY_MINT_AUTHORITY
            );

        if (!mintAuthoritySignature?.signature) {
            throw new Error(
                'MEGY Mint Authority signature is missing.'
            );
        }

        /*
         * Cryptographically verify all required signatures.
         */
        if (!signedTransaction.verifySignatures()) {
            throw new Error(
                'Signed transaction signature verification failed.'
            );
        }

        return {
            valid: true,
            error: null,
        };
    } catch (error: unknown) {
        return {
            valid: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Signed transaction verification failed.',
        };
    }
}

function statusClass(
    status?: string | null
): string {
    const normalized = String(
        status ?? ''
    ).toLowerCase();

    if (
        normalized.includes('ready') ||
        normalized.includes('authorized') ||
        normalized.includes('active')
    ) {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    }

    if (
        normalized.includes('complete') ||
        normalized.includes('fully')
    ) {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
    }

    return 'border-white/10 bg-white/5 text-white/70';
}

async function getOverview(): Promise<OverviewResponse> {
    const response = await fetch(
        '/api/admin/megy-issuance/overview',
        {
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'X-Requested-With': 'fetch',
            },
        }
    );

    const json =
        (await response
            .json()
            .catch(() => ({}))) as Partial<OverviewResponse>;

    if (!response.ok) {
        throw new Error(
            json?.error || `HTTP ${response.status}`
        );
    }

    if (!json?.success) {
        throw new Error(
            json?.error || 'OVERVIEW_FAILED'
        );
    }

    return json as OverviewResponse;
}

export default function MegyIssuancePage() {
    const {
        publicKey,
        connected,
        wallet,
        signTransaction,
    } = useWallet();

    const { setVisible } = useWalletModal();

    const connectedWalletAddress = useMemo(
        () => publicKey?.toBase58() ?? null,
        [publicKey]
    );

    const connectedWalletName =
        wallet?.adapter?.name ?? 'Wallet';

    const signerReady =
        connected &&
        connectedWalletAddress ===
        MEGY_MINT_AUTHORITY;

    const [data, setData] =
        useState<OverviewResponse | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [issuanceAmounts, setIssuanceAmounts] =
        useState<Record<string, string>>({});

    const [preparingKey, setPreparingKey] =
        useState<string | null>(null);

    const [preparedIssuance, setPreparedIssuance] =
        useState<PrepareIssuanceResponse | null>(null);

    const [
        preparedIssuanceVerified,
        setPreparedIssuanceVerified,
    ] = useState(false);

    const [prepareError, setPrepareError] =
        useState<string | null>(null);

    const [signingPreparedTransaction, setSigningPreparedTransaction] =
        useState(false);

    const [signedTransactionBase64, setSignedTransactionBase64] =
        useState<string | null>(null);

    const [signingError, setSigningError] =
        useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const overview = await getOverview();
            setData(overview);
        } catch (e: any) {
            setData(null);

            setError(
                String(
                    e?.message ||
                    'Failed to load MEGY issuance overview'
                )
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const ledgers = data?.ledgers ?? [];
    const events =
        data?.recentMintEvents ?? [];

    const decimals =
        Number.isInteger(data?.megy?.decimals)
            ? data!.megy.decimals
            : 9;

    const preparedTransactionVerification =
        useMemo<PreparedTransactionVerification>(() => {
            if (!preparedIssuance) {
                return {
                    valid: false,
                    error: null,
                };
            }

            return verifyPreparedTransactionStructure(
                preparedIssuance
            );
        }, [preparedIssuance]);

    const preparedTransactionReady =
        preparedIssuance !== null &&
        preparedIssuanceVerified &&
        preparedTransactionVerification.valid;

    const getIssuanceAmountKey = (
        ledgerId: string,
        mintType: BucketMintType
    ) => `${ledgerId}:${mintType}`;

    const setIssuanceAmount = (
        ledgerId: string,
        mintType: BucketMintType,
        value: string
    ) => {
        const key = getIssuanceAmountKey(
            ledgerId,
            mintType
        );

        setIssuanceAmounts((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const prepareIssuance = async (
        ledger: IssuanceLedger,
        bucket: LedgerBucket,
        amountBase: bigint
    ) => {
        const key = getIssuanceAmountKey(
            ledger.issuanceLedgerId,
            bucket.mintType
        );

        if (!signerReady) {
            setPrepareError(
                'MEGY Mint Authority signer is required.'
            );
            return;
        }

        if (amountBase <= 0n) {
            setPrepareError(
                'Issuance amount must be greater than zero.'
            );
            return;
        }

        setPreparingKey(key);
        setPrepareError(null);
        setPreparedIssuanceVerified(false);

        try {
            const response = await fetch(
                '/api/admin/megy-issuance/prepare',
                {
                    method: 'POST',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'fetch',
                    },
                    body: JSON.stringify({
                        issuanceLedgerId:
                            ledger.issuanceLedgerId,
                        mintType: bucket.mintType,
                        amountBase:
                            amountBase.toString(),
                    }),
                }
            );

            const json = (await response
                .json()
                .catch(() => ({}))) as Partial<PrepareIssuanceResponse>;

            if (!response.ok || !json.success) {
                throw new Error(
                    json.error ||
                    `Prepare failed (HTTP ${response.status})`
                );
            }

            const prepared =
                json as PrepareIssuanceResponse;

            /*
             * From this point forward the server has already
             * created a real issuance intent and reserved
             * economic capacity.
             *
             * Preserve the prepared intent locally before
             * performing additional client-side consistency
             * checks so a successful reservation is never
             * silently forgotten by the UI.
             */
            setPreparedIssuance(prepared);

            /*
             * Fail closed if the server response does not
             * describe exactly the operation selected in UI.
             */
            if (
                prepared.issuance.issuanceLedgerId !==
                ledger.issuanceLedgerId ||
                prepared.issuance.mintType !==
                bucket.mintType ||
                prepared.issuance.amountBase !==
                amountBase.toString()
            ) {
                throw new Error(
                    'Prepared issuance does not match the requested operation.'
                );
            }

            if (
                prepared.destination.wallet !==
                bucket.destinationWallet
            ) {
                throw new Error(
                    'Prepared issuance destination mismatch.'
                );
            }

            if (
                prepared.transaction.requiredSigner !==
                MEGY_MINT_AUTHORITY ||
                prepared.transaction.feePayer !==
                MEGY_MINT_AUTHORITY ||
                prepared.megy.mintAuthority !==
                MEGY_MINT_AUTHORITY
            ) {
                throw new Error(
                    'Prepared issuance authority mismatch.'
                );
            }

            setPreparedIssuanceVerified(true);

        } catch (e: any) {

            setPrepareError(
                String(
                    e?.message ||
                    'Failed to prepare MEGY issuance.'
                )
            );
        } finally {
            setPreparingKey(null);
        }
    };

    const signPreparedIssuance = async () => {
        if (!preparedIssuance) {
            setSigningError(
                'No prepared issuance transaction exists.'
            );
            return;
        }

        if (!preparedTransactionReady) {
            setSigningError(
                'Prepared transaction has not passed verification.'
            );
            return;
        }

        if (!signerReady) {
            setSigningError(
                'MEGY Mint Authority signer is required.'
            );
            return;
        }

        if (!signTransaction) {
            setSigningError(
                'Connected wallet does not support transaction signing.'
            );
            return;
        }

        setSigningPreparedTransaction(true);
        setSigningError(null);
        setSignedTransactionBase64(null);

        try {
            /*
             * Always reconstruct the exact server-prepared transaction.
             * Never sign a transaction assembled from UI state.
             */
            const transaction = Transaction.from(
                Buffer.from(
                    preparedIssuance.transaction
                        .serializedBase64,
                    'base64'
                )
            );

            /*
             * This is the point where Solflare/Ledger should request
             * the physical Ledger approval.
             *
             * signTransaction signs only. It does NOT broadcast.
             */
            const signedTransaction =
                await signTransaction(transaction);

            const verification =
                verifySignedPreparedTransaction(
                    preparedIssuance,
                    signedTransaction
                );

            if (!verification.valid) {
                throw new Error(
                    verification.error ||
                    'Signed transaction verification failed.'
                );
            }

            /*
             * Preserve the verified signed bytes in memory only.
             * Nothing is sent to Solana or /broadcast in this step.
             */
            const serialized =
                signedTransaction.serialize();

            setSignedTransactionBase64(
                serialized.toString('base64')
            );
        } catch (error: unknown) {
            setSignedTransactionBase64(null);

            setSigningError(
                error instanceof Error
                    ? error.message
                    : 'Ledger transaction signing failed.'
            );
        } finally {
            setSigningPreparedTransaction(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#090d15] text-white">
            <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold">
                                MEGY Issuance
                            </h1>

                            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                                Mainnet
                            </span>

                            <span className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-200">
                                Controlled Issuance
                            </span>
                        </div>

                        <p className="mt-2 max-w-2xl text-xs leading-5 text-white/60">
                            Production MEGY issuance authorization,
                            treasury capacity, and on-chain mint
                            history. Phase finalization authorizes
                            issuance; it does not mint tokens.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => void refresh()}
                        disabled={loading}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                    >
                        {loading
                            ? 'Refreshing…'
                            : 'Refresh'}
                    </button>
                </div>

                <div
                    className={`${CARD} border-emerald-500/20 bg-emerald-500/10`}
                >
                    <div className="text-sm font-semibold text-emerald-100">
                        Production issuance security domain
                    </div>

                    <div className="mt-1 text-xs leading-5 text-emerald-200/80">
                        Issuance is authorized only by
                        finalized production phases. The MEGY
                        Mint Authority remains offline on Ledger
                        and no mint authority secret is stored
                        by the backend.
                    </div>
                </div>

                <section
                    className={[
                        CARD,
                        signerReady
                            ? 'border-emerald-500/25 bg-emerald-500/5'
                            : connected
                                ? 'border-amber-500/25 bg-amber-500/5'
                                : 'border-white/10',
                    ].join(' ')}
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-white">
                                    MEGY Issuance Signer
                                </div>

                                {signerReady ? (
                                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                        Ledger Mint Authority Ready
                                    </span>
                                ) : connected ? (
                                    <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                                        Wrong issuance signer
                                    </span>
                                ) : (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/55">
                                        Not connected
                                    </span>
                                )}
                            </div>

                            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                <div>
                                    <div className="text-white/40">
                                        Required signer
                                    </div>

                                    <div className="mt-1 break-all font-mono text-white/75">
                                        {MEGY_MINT_AUTHORITY}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-white/40">
                                        Connected signer
                                    </div>

                                    <div
                                        className={[
                                            'mt-1 break-all font-mono',
                                            signerReady
                                                ? 'text-emerald-300'
                                                : connected
                                                    ? 'text-amber-300'
                                                    : 'text-white/50',
                                        ].join(' ')}
                                    >
                                        {connectedWalletAddress
                                            ? `${connectedWalletName} · ${connectedWalletAddress}`
                                            : 'No wallet connected'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 text-xs leading-5 text-white/45">
                                The admin session authorizes the operation.
                                The connected Ledger Mint Authority signs the
                                Solana issuance transaction and pays its
                                network fee.
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setVisible(true)}
                            className={[
                                'shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
                                signerReady
                                    ? 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                                    : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15',
                            ].join(' ')}
                        >
                            {signerReady
                                ? 'Switch Wallet'
                                : connected
                                    ? 'Switch to Mint Authority'
                                    : 'Connect Mint Authority'}
                        </button>
                    </div>

                    {signerReady && (
                        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 text-xs sm:grid-cols-3">
                            <div className="flex items-center gap-2 text-emerald-300">
                                <span>✓</span>
                                <span>Signer verified</span>
                            </div>

                            <div className="flex items-center gap-2 text-emerald-300">
                                <span>✓</span>
                                <span>Mint Authority verified</span>
                            </div>

                            <div className="flex items-center gap-2 text-emerald-300">
                                <span>✓</span>
                                <span>Fee payer verified</span>
                            </div>
                        </div>
                    )}
                </section>

                {error && (
                    <div
                        className={`${CARD} border-red-500/20 bg-red-500/10`}
                    >
                        <div className="text-sm font-semibold text-red-100">
                            Failed to load issuance overview
                        </div>

                        <div className="mt-1 text-xs text-red-200/80">
                            {error}
                        </div>
                    </div>
                )}

                {loading && !data && (
                    <div
                        className={`${CARD} text-sm text-white/60`}
                    >
                        Loading MEGY issuance state…
                    </div>
                )}

                {data && (
                    <>
                        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className={CARD}>
                                <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                                    MEGY Mainnet Mint
                                </div>

                                <div
                                    className="mt-2 break-all font-mono text-sm text-white"
                                    title={data.megy.mintAddress}
                                >
                                    {data.megy.mintAddress}
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <div className="text-white/40">
                                            Program
                                        </div>

                                        <div className="mt-1 text-white/80">
                                            {data.megy.program}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-white/40">
                                            Decimals
                                        </div>

                                        <div className="mt-1 text-white/80">
                                            {data.megy.decimals}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-white/40">
                                            Network
                                        </div>

                                        <div className="mt-1 text-white/80">
                                            {data.megy.network}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-white/40">
                                            Issuance ledgers
                                        </div>

                                        <div className="mt-1 text-white/80">
                                            {ledgers.length.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={CARD}>
                                <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                                    Authority
                                </div>

                                <div className="mt-3 space-y-4 text-xs">
                                    <div>
                                        <div className="text-white/40">
                                            Mint Authority
                                        </div>

                                        <div
                                            className="mt-1 break-all font-mono text-white/80"
                                            title={
                                                data.megy.mintAuthority
                                            }
                                        >
                                            {data.megy.mintAuthority}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-white/40">
                                            Fee Payer
                                        </div>

                                        <div
                                            className="mt-1 break-all font-mono text-white/80"
                                            title={
                                                data.megy.feePayer.wallet
                                            }
                                        >
                                            {data.megy.feePayer.wallet}
                                        </div>

                                        <div className="mt-1 text-[11px] text-white/40">
                                            {data.megy.feePayer.mode}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-white/40">
                                            Authorized Admin Session
                                        </div>

                                        <div
                                            className="mt-1 break-all font-mono text-white/80"
                                            title={
                                                data.operator.adminWallet
                                            }
                                        >
                                            {data.operator.adminWallet}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <div className="mb-3">
                                <h2 className="text-lg font-semibold">
                                    Treasury Destinations
                                </h2>

                                <p className="mt-1 text-xs text-white/50">
                                    Fixed server-side destinations.
                                    These addresses are not supplied by
                                    the client.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {BUCKET_ORDER.map((bucket) => {
                                    const info =
                                        data.bucketDestinations[
                                        bucket.key
                                        ];

                                    return (
                                        <div
                                            key={bucket.key}
                                            className={CARD}
                                        >
                                            <div className="text-sm font-semibold text-white">
                                                {info.label ||
                                                    bucket.label}
                                            </div>

                                            <div className="mt-1 text-[11px] text-white/40">
                                                {info.mintType}
                                            </div>

                                            <div
                                                className="mt-3 break-all font-mono text-xs text-white/70"
                                                title={
                                                    info.destinationWallet
                                                }
                                            >
                                                {info.destinationWallet}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section
                            className={[
                                CARD,
                                ledgers.length > 0
                                    ? 'border-emerald-500/25 bg-emerald-500/5'
                                    : 'border-sky-500/20 bg-sky-500/5',
                            ].join(' ')}
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-sm font-semibold text-white">
                                            Issuance Controls
                                        </div>

                                        {ledgers.length > 0 ? (
                                            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                                Production Authorization Available
                                            </span>
                                        ) : (
                                            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                                                Locked
                                            </span>
                                        )}
                                    </div>

                                    {ledgers.length === 0 ? (
                                        <>
                                            <div className="mt-3 text-sm font-medium text-white/80">
                                                No production issuance authorization exists.
                                            </div>

                                            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">
                                                Issuance controls remain unavailable until a
                                                production phase is finalized and creates an
                                                authorized MEGY issuance ledger.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mt-3 text-sm font-medium text-emerald-200">
                                                Production issuance capacity is available.
                                            </div>

                                            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">
                                                Minting may proceed only within the remaining
                                                authorized capacity of an issuance ledger and
                                                requires the MEGY Mint Authority signer.
                                            </p>
                                        </>
                                    )}
                                </div>

                                <div className="shrink-0">
                                    <div
                                        className={[
                                            'rounded-xl border px-4 py-3 text-xs font-semibold',
                                            signerReady && ledgers.length > 0
                                                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                                                : 'border-white/10 bg-white/5 text-white/45',
                                        ].join(' ')}
                                    >
                                        {ledgers.length === 0
                                            ? 'Awaiting Production Ledger'
                                            : signerReady
                                                ? 'Ready for Issuance'
                                                : 'Mint Authority Required'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 text-xs sm:grid-cols-3">
                                <div
                                    className={
                                        signerReady
                                            ? 'text-emerald-300'
                                            : 'text-white/40'
                                    }
                                >
                                    {signerReady ? '✓' : '○'} Mint Authority Signer
                                </div>

                                <div
                                    className={
                                        ledgers.length > 0
                                            ? 'text-emerald-300'
                                            : 'text-white/40'
                                    }
                                >
                                    {ledgers.length > 0 ? '✓' : '○'} Production
                                    Authorization
                                </div>

                                <div
                                    className={
                                        signerReady && ledgers.length > 0
                                            ? 'text-emerald-300'
                                            : 'text-white/40'
                                    }
                                >
                                    {signerReady && ledgers.length > 0 ? '✓' : '○'}{' '}
                                    Issuance Controls
                                </div>
                            </div>
                        </section>

                        {prepareError && (
                            <div
                                className={`${CARD} border-red-500/20 bg-red-500/10`}
                            >
                                <div className="text-sm font-semibold text-red-100">
                                    Issuance preparation failed
                                </div>

                                <div className="mt-1 text-xs leading-5 text-red-200/80">
                                    {prepareError}
                                </div>
                            </div>
                        )}

                        {preparedIssuance && (
                            <section
                                className={[
                                    CARD,
                                    preparedTransactionReady
                                        ? 'border-emerald-400/25 bg-emerald-400/5'
                                        : 'border-red-500/25 bg-red-500/5',
                                ].join(' ')}
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-semibold">
                                                Review Issuance
                                            </h2>

                                            <span
                                                className={[
                                                    'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                                                    preparedTransactionReady
                                                        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                                        : 'border-red-400/25 bg-red-400/10 text-red-200'
                                                ].join(' ')}
                                            >
                                                {preparedTransactionReady
                                                    ? 'Transaction Verified'
                                                    : 'Verification Failed'}
                                            </span>
                                        </div>

                                        <p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">
                                            Review the exact issuance operation before
                                            requesting a Ledger signature. No transaction
                                            has been signed or broadcast yet.
                                        </p>
                                    </div>

                                    <div className="text-left sm:text-right">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            Intent
                                        </div>

                                        <div className="mt-1 font-mono text-xs text-white/70">
                                            #{preparedIssuance.intent.id}
                                        </div>

                                        <div className="mt-1 text-[11px] text-white/40">
                                            Expires{' '}
                                            {formatDate(
                                                preparedIssuance.intent.expiresAt
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            Amount
                                        </div>

                                        <div className="mt-1 font-mono text-sm font-semibold text-emerald-200">
                                            {formatBaseUnits(
                                                preparedIssuance.issuance.amountBase,
                                                preparedIssuance.megy.decimals
                                            )}{' '}
                                            MEGY
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            Bucket
                                        </div>

                                        <div className="mt-1 text-xs font-semibold text-white/80">
                                            {preparedIssuance.issuance.mintType}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            Phase
                                        </div>

                                        <div className="mt-1 text-xs font-semibold text-white/80">
                                            #
                                            {preparedIssuance.issuance.phaseNo ??
                                                '-'}
                                        </div>

                                        <div className="mt-1 font-mono text-[10px] text-white/40">
                                            ID {preparedIssuance.issuance.phaseId}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            Fixed Treasury Destination
                                        </div>

                                        <div
                                            className="mt-2 break-all font-mono text-xs text-white/75"
                                            title={
                                                preparedIssuance.destination.wallet
                                            }
                                        >
                                            {preparedIssuance.destination.wallet}
                                        </div>

                                        <div className="mt-3 text-[10px] uppercase tracking-wide text-white/35">
                                            Destination ATA
                                        </div>

                                        <div
                                            className="mt-1 break-all font-mono text-[11px] text-white/55"
                                            title={preparedIssuance.destination.ata}
                                        >
                                            {preparedIssuance.destination.ata}
                                        </div>

                                        <div className="mt-2 text-[11px] text-white/45">
                                            {preparedIssuance.destination
                                                .ataWillBeCreated
                                                ? 'ATA will be created by this transaction.'
                                                : 'Existing ATA will be used.'}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                                        <div className="text-[10px] uppercase tracking-wide text-white/35">
                                            MEGY Mint
                                        </div>

                                        <div
                                            className="mt-2 break-all font-mono text-xs text-white/75"
                                            title={
                                                preparedIssuance.megy.mintAddress
                                            }
                                        >
                                            {preparedIssuance.megy.mintAddress}
                                        </div>

                                        <div className="mt-3 text-[10px] uppercase tracking-wide text-white/35">
                                            Required Signer / Fee Payer
                                        </div>

                                        <div
                                            className="mt-1 break-all font-mono text-[11px] text-white/55"
                                            title={
                                                preparedIssuance.transaction
                                                    .requiredSigner
                                            }
                                        >
                                            {
                                                preparedIssuance.transaction
                                                    .requiredSigner
                                            }
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    <div
                                        className={[
                                            'rounded-xl border p-3 text-xs leading-5',
                                            preparedIssuanceVerified
                                                ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200/80'
                                                : 'border-red-400/20 bg-red-400/5 text-red-200/80',
                                        ].join(' ')}
                                    >
                                        {preparedIssuanceVerified
                                            ? '✓ Server response matches the selected issuance operation.'
                                            : '✕ Server response consistency verification failed.'}
                                    </div>

                                    <div
                                        className={[
                                            'rounded-xl border p-3 text-xs leading-5',
                                            preparedTransactionVerification.valid
                                                ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200/80'
                                                : 'border-red-400/20 bg-red-400/5 text-red-200/80',
                                        ].join(' ')}
                                    >
                                        {preparedTransactionVerification.valid
                                            ? '✓ Serialized Solana transaction verified.'
                                            : `✕ ${preparedTransactionVerification.error ||
                                            'Serialized transaction verification failed.'
                                            }`}
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-xs text-white/45">
                                        Next step: Ledger transaction signature
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            !preparedTransactionReady ||
                                            !signerReady ||
                                            !signTransaction ||
                                            signingPreparedTransaction ||
                                            signedTransactionBase64 !== null
                                        }
                                        onClick={() => {
                                            void signPreparedIssuance();
                                        }}
                                        className={[
                                            'rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
                                            preparedTransactionReady &&
                                                signerReady &&
                                                signTransaction &&
                                                !signingPreparedTransaction &&
                                                signedTransactionBase64 === null
                                                ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15'
                                                : 'cursor-not-allowed border-white/10 bg-white/5 text-white/30',
                                        ].join(' ')}
                                    >
                                        {signingPreparedTransaction
                                            ? 'Waiting for Ledger…'
                                            : signedTransactionBase64
                                                ? 'Ledger Signature Verified ✓'
                                                : 'Sign with Ledger'}
                                    </button>
                                </div>
                                {signingError && (
                                    <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs leading-5 text-red-200/80">
                                        <div className="font-semibold">
                                            Ledger signing failed
                                        </div>

                                        <div className="mt-1">
                                            {signingError}
                                        </div>
                                    </div>
                                )}

                                {signedTransactionBase64 && (
                                    <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs leading-5 text-emerald-200/80">
                                        <div className="font-semibold">
                                            ✓ Ledger signature verified
                                        </div>

                                        <div className="mt-1">
                                            The signed transaction matches the reviewed
                                            issuance transaction and contains a valid MEGY
                                            Mint Authority signature.
                                        </div>

                                        <div className="mt-1 text-emerald-200/55">
                                            The transaction has not been broadcast.
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        <section>
                            <div className="mb-3">
                                <h2 className="text-lg font-semibold">
                                    Production Issuance Ledgers
                                </h2>

                                <p className="mt-1 text-xs text-white/50">
                                    Authorized capacity originates only
                                    from finalized production phases.
                                </p>
                            </div>

                            {ledgers.length === 0 ? (
                                <div
                                    className={`${CARD} border-sky-500/20 bg-sky-500/5`}
                                >
                                    <div className="text-sm font-semibold text-sky-100">
                                        No production issuance authorized
                                        yet
                                    </div>

                                    <div className="mt-1 max-w-2xl text-xs leading-5 text-sky-200/70">
                                        No finalized production phase has
                                        created a MEGY issuance ledger.
                                        This is the expected state before
                                        FIRST LIGHT. No mint action is
                                        available.
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {ledgers.map((ledger) => (
                                        <div
                                            key={
                                                ledger.issuanceLedgerId
                                            }
                                            className={CARD}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <div className="font-semibold">
                                                        Phase #
                                                        {ledger.phaseNo ?? '-'}
                                                        {ledger.phaseName
                                                            ? ` — ${ledger.phaseName}`
                                                            : ''}
                                                    </div>

                                                    <div className="mt-1 text-xs text-white/45">
                                                        Ledger{' '}
                                                        {
                                                            ledger.issuanceLedgerId
                                                        }{' '}
                                                        • Phase ID{' '}
                                                        {ledger.phaseId}
                                                    </div>

                                                    <div className="mt-1 text-[11px] text-white/40">
                                                        Finalized:{' '}
                                                        {formatDate(
                                                            ledger.finalizedAt
                                                        )}
                                                        {ledger.tokenomicsVersion
                                                            ? ` • Tokenomics ${ledger.tokenomicsVersion}`
                                                            : ''}
                                                    </div>
                                                </div>

                                                <span
                                                    className={[
                                                        'w-fit rounded-md border px-2 py-1 text-xs font-semibold',
                                                        statusClass(
                                                            ledger.issuanceStatus
                                                        ),
                                                    ].join(' ')}
                                                >
                                                    {ledger.issuanceStatus ||
                                                        'authorized'}
                                                </span>
                                            </div>

                                            <div className="mt-5 overflow-x-auto">
                                                <table className="min-w-[1080px] w-full text-xs">
                                                    <thead className="text-white/40">
                                                        <tr>
                                                            <th className="pb-2 text-left font-medium">
                                                                Bucket
                                                            </th>

                                                            <th className="pb-2 text-right font-medium">
                                                                Authorized
                                                            </th>

                                                            <th className="pb-2 text-right font-medium">
                                                                Minted
                                                            </th>

                                                            <th className="pb-2 text-right font-medium">
                                                                Remaining
                                                            </th>

                                                            <th className="pb-2 pl-6 text-left font-medium">
                                                                Issuance
                                                            </th>
                                                        </tr>
                                                    </thead>

                                                    <tbody>
                                                        {BUCKET_ORDER.map(
                                                            (bucket) => {
                                                                const values =
                                                                    ledger.buckets[
                                                                    bucket.key
                                                                    ];

                                                                const amountKey =
                                                                    getIssuanceAmountKey(
                                                                        ledger.issuanceLedgerId,
                                                                        values.mintType
                                                                    );

                                                                const amountInput =
                                                                    issuanceAmounts[amountKey] ?? '';

                                                                let remainingBase = 0n;

                                                                try {
                                                                    remainingBase = BigInt(
                                                                        values.remainingBase
                                                                    );
                                                                } catch {
                                                                    remainingBase = 0n;
                                                                }

                                                                const amountBase =
                                                                    parseMegyAmountToBaseUnits(
                                                                        amountInput,
                                                                        decimals
                                                                    );

                                                                const hasRemaining =
                                                                    remainingBase > 0n;

                                                                const amountValid =
                                                                    amountBase !== null &&
                                                                    amountBase > 0n &&
                                                                    amountBase <= remainingBase;

                                                                const bucketReady =
                                                                    signerReady &&
                                                                    hasRemaining &&
                                                                    amountValid;

                                                                return (
                                                                    <tr
                                                                        key={
                                                                            bucket.key
                                                                        }
                                                                        className="border-t border-white/10"
                                                                    >
                                                                        <td className="py-3 pr-4 text-white/75">
                                                                            {
                                                                                values.label
                                                                            }
                                                                        </td>

                                                                        <td className="px-4 py-3 text-right font-mono text-white/70">
                                                                            {formatBaseUnits(
                                                                                values.authorizedBase,
                                                                                decimals
                                                                            )}
                                                                        </td>

                                                                        <td className="px-4 py-3 text-right font-mono text-white/70">
                                                                            {formatBaseUnits(
                                                                                values.mintedBase,
                                                                                decimals
                                                                            )}
                                                                        </td>

                                                                        <td className="py-3 pl-4 text-right font-mono font-semibold text-emerald-200">
                                                                            {formatBaseUnits(
                                                                                values.remainingBase,
                                                                                decimals
                                                                            )}
                                                                        </td>

                                                                        <td className="min-w-[310px] py-3 pl-6">
                                                                            <div className="space-y-3">
                                                                                <div>
                                                                                    <label className="text-[11px] font-medium text-white/45">
                                                                                        Amount (MEGY)
                                                                                    </label>

                                                                                    <input
                                                                                        type="text"
                                                                                        inputMode="decimal"
                                                                                        autoComplete="off"
                                                                                        value={amountInput}
                                                                                        disabled={!hasRemaining}
                                                                                        onChange={(event) => {
                                                                                            setIssuanceAmount(
                                                                                                ledger.issuanceLedgerId,
                                                                                                values.mintType,
                                                                                                event.target.value
                                                                                            );
                                                                                        }}
                                                                                        placeholder={
                                                                                            hasRemaining
                                                                                                ? 'Enter amount'
                                                                                                : 'No remaining capacity'
                                                                                        }
                                                                                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                                                                                    />
                                                                                </div>

                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {([25, 50, 100] as const).map(
                                                                                        (percent) => (
                                                                                            <button
                                                                                                key={percent}
                                                                                                type="button"
                                                                                                disabled={!hasRemaining}
                                                                                                onClick={() => {
                                                                                                    setIssuanceAmount(
                                                                                                        ledger.issuanceLedgerId,
                                                                                                        values.mintType,
                                                                                                        percentageOfBaseUnits(
                                                                                                            values.remainingBase,
                                                                                                            percent,
                                                                                                            decimals
                                                                                                        )
                                                                                                    );
                                                                                                }}
                                                                                                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/65 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                                                                                            >
                                                                                                {percent}%
                                                                                            </button>
                                                                                        )
                                                                                    )}
                                                                                </div>

                                                                                <div className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2">
                                                                                    <div className="text-[10px] uppercase tracking-wide text-white/35">
                                                                                        Fixed destination
                                                                                    </div>

                                                                                    <div
                                                                                        className="mt-1 break-all font-mono text-[11px] text-white/60"
                                                                                        title={values.destinationWallet}
                                                                                    >
                                                                                        {shortAddress(
                                                                                            values.destinationWallet
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                {amountInput && !amountValid && (
                                                                                    <div className="text-[11px] text-amber-300">
                                                                                        {amountBase === null ||
                                                                                            amountBase <= 0n
                                                                                            ? 'Enter a valid positive MEGY amount.'
                                                                                            : 'Amount exceeds remaining authorized capacity.'}
                                                                                    </div>
                                                                                )}

                                                                                {!signerReady && (
                                                                                    <div className="text-[11px] text-amber-300">
                                                                                        MEGY Mint Authority signer is required.
                                                                                    </div>
                                                                                )}

                                                                                <button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        !bucketReady ||
                                                                                        preparingKey !== null ||
                                                                                        preparedIssuance !== null
                                                                                    }
                                                                                    onClick={() => {
                                                                                        if (
                                                                                            amountBase === null ||
                                                                                            amountBase <= 0n
                                                                                        ) {
                                                                                            return;
                                                                                        }

                                                                                        void prepareIssuance(
                                                                                            ledger,
                                                                                            values,
                                                                                            amountBase
                                                                                        );
                                                                                    }}
                                                                                    className={[
                                                                                        'w-full rounded-lg border px-3 py-2 text-xs font-semibold transition',
                                                                                        bucketReady &&
                                                                                            preparingKey === null &&
                                                                                            preparedIssuance === null
                                                                                            ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15'
                                                                                            : 'cursor-not-allowed border-white/10 bg-white/5 text-white/30',
                                                                                    ].join(' ')}
                                                                                >
                                                                                    {preparingKey === amountKey
                                                                                        ? 'Preparing…'
                                                                                        : preparedIssuance !== null
                                                                                            ? 'Review Pending'
                                                                                            : 'Prepare Issuance'}
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            }
                                                        )}
                                                    </tbody>

                                                    <tfoot className="border-t border-white/20">
                                                        <tr>
                                                            <td className="pt-3 pr-4 font-semibold text-white">
                                                                Total
                                                            </td>

                                                            <td className="px-4 pt-3 text-right font-mono font-semibold text-white">
                                                                {formatBaseUnits(
                                                                    ledger.totals
                                                                        .authorizedBase,
                                                                    decimals
                                                                )}
                                                            </td>

                                                            <td className="px-4 pt-3 text-right font-mono font-semibold text-white">
                                                                {formatBaseUnits(
                                                                    ledger.totals
                                                                        .mintedBase,
                                                                    decimals
                                                                )}
                                                            </td>

                                                            <td className="pt-3 pl-4 text-right font-mono font-semibold text-emerald-200">
                                                                {formatBaseUnits(
                                                                    ledger.totals
                                                                        .remainingBase,
                                                                    decimals
                                                                )}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <div className="mb-3">
                                <h2 className="text-lg font-semibold">
                                    Recent Mint Events
                                </h2>

                                <p className="mt-1 text-xs text-white/50">
                                    Append-only issuance audit history.
                                </p>
                            </div>

                            {events.length === 0 ? (
                                <div
                                    className={`${CARD} text-sm text-white/55`}
                                >
                                    No MEGY issuance events recorded
                                    yet.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f18]">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[980px] w-full text-xs">
                                            <thead className="bg-white/5 text-white/50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left">
                                                        Date
                                                    </th>

                                                    <th className="px-4 py-3 text-left">
                                                        Type
                                                    </th>

                                                    <th className="px-4 py-3 text-right">
                                                        Amount
                                                    </th>

                                                    <th className="px-4 py-3 text-left">
                                                        Destination
                                                    </th>

                                                    <th className="px-4 py-3 text-left">
                                                        Transaction
                                                    </th>

                                                    <th className="px-4 py-3 text-left">
                                                        Admin
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {events.map((event) => (
                                                    <tr
                                                        key={event.id}
                                                        className="border-t border-white/10"
                                                    >
                                                        <td className="px-4 py-3 text-white/60">
                                                            {formatDate(
                                                                event.createdAt
                                                            )}
                                                        </td>

                                                        <td className="px-4 py-3 text-white/75">
                                                            {event.mintType}
                                                        </td>

                                                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-200">
                                                            {formatBaseUnits(
                                                                event.amountBase,
                                                                decimals
                                                            )}
                                                        </td>

                                                        <td
                                                            className="px-4 py-3 font-mono text-white/60"
                                                            title={
                                                                event.destinationWallet
                                                            }
                                                        >
                                                            {shortAddress(
                                                                event.destinationWallet
                                                            )}
                                                        </td>

                                                        <td
                                                            className="px-4 py-3 font-mono text-white/60"
                                                            title={
                                                                event.txSignature
                                                            }
                                                        >
                                                            {shortAddress(
                                                                event.txSignature
                                                            )}
                                                        </td>

                                                        <td
                                                            className="px-4 py-3 font-mono text-white/60"
                                                            title={
                                                                event.createdBy ?? undefined
                                                            }
                                                        >
                                                            {shortAddress(
                                                                event.createdBy
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}