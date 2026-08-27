// app/api/claim/fee/quote/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import {
    calculateClaimFeeQuote,
} from '@/app/api/_lib/claim/fee';

import {
    NextRequest,
    NextResponse,
} from 'next/server';

import {
    PublicKey,
} from '@solana/web3.js';

import {
    AccountLayout,
    getAssociatedTokenAddress,
} from '@solana/spl-token';

import {
    sql,
} from '@/app/api/_lib/db';

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

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const BASE_CLAIM_FEE_LAMPORTS = Number(
    process.env.CLAIM_FEE_LAMPORTS ??
    3_000_000
);

const QUOTE_TTL_SECONDS = 120;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ClaimScope =
    | 'wallet'
    | 'identity';

type Body = {
    wallet_address?: string;
    destination?: string;
    phase_id?: number;
    claim_scope?: ClaimScope;
    claim_amount?: string | number;
};

type DbRow = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function json(
    status: number,
    data: Record<string, unknown>
) {
    return NextResponse.json(
        data,
        {
            status,
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}

function asString(
    value: unknown
): string {
    return String(
        value ?? ''
    ).trim();
}

function asDbRow(
    value: unknown
): DbRow {
    return (
        typeof value === 'object' &&
        value !== null
    )
        ? value as DbRow
        : {};
}

function validateConfiguration():
  | {
      ok: true;
      megyMint: PublicKey;
      megyDecimals: number;
      claimFeeTreasury: PublicKey;
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
      error:
        'BAD_CLAIM_FEE_CONFIG',
    };
  }

  const megyMintRaw =
    asString(
      process.env.MEGY_MINT
    );

  if (!megyMintRaw) {
    return {
      ok: false,
      error: 'CLAIM_NOT_LIVE',
    };
  }

  const megyDecimals =
    Number(
      process.env.MEGY_DECIMALS ??
        9
    );

  if (
    !Number.isInteger(
      megyDecimals
    ) ||
    megyDecimals < 0 ||
    megyDecimals > 18
  ) {
    return {
      ok: false,
      error:
        'BAD_MEGY_DECIMALS',
    };
  }

  const claimFeeTreasuryRaw =
    asString(
      process.env
        .CLAIM_FEE_TREASURY
    );

  if (!claimFeeTreasuryRaw) {
    return {
      ok: false,
      error:
        'CLAIM_FEE_TREASURY_MISSING',
    };
  }

  let megyMint:
    PublicKey;

  try {
    megyMint =
      new PublicKey(
        megyMintRaw
      );
  } catch {
    return {
      ok: false,
      error:
        'BAD_MEGY_MINT',
    };
  }

  let claimFeeTreasury:
    PublicKey;

  try {
    claimFeeTreasury =
      new PublicKey(
        claimFeeTreasuryRaw
      );
  } catch {
    return {
      ok: false,
      error:
        'BAD_CLAIM_FEE_TREASURY',
    };
  }

  return {
    ok: true,
    megyMint,
    megyDecimals,
    claimFeeTreasury,
  };
}

async function getUnusedAtaEntitlement(
    params: {
        identityId: string;
        destination: string;
    }
): Promise<{
    paymentId: number;
    ataCreationLamports: number;
} | null> {
    const rows =
        await sql`
        SELECT
          id,
          ata_creation_lamports
        FROM claim_fee_payments
        WHERE identity_id =
          ${params.identityId}
          AND destination =
            ${params.destination}
          AND ata_creation_lamports > 0
          AND ata_consumed_at IS NULL
          AND ata_consumed_tx_signature IS NULL
        ORDER BY
          created_at ASC,
          id ASC
        LIMIT 1
      `;

    if (!rows?.length) {
        return null;
    }

    const row =
        asDbRow(rows[0]);

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

function toBaseUnits(
    amountLike: string | number,
    decimals: number
): bigint {
    const raw =
        String(
            amountLike ?? ''
        ).trim();

    if (!raw) {
        throw new Error(
            'BAD_AMOUNT'
        );
    }

    if (
        !/^\d+(\.\d+)?$/.test(
            raw
        )
    ) {
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
            .replace(
                /^0+/,
                ''
            ) || '0';

    return BigInt(full);
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
    req: NextRequest
) {
    let body: Body | null =
        null;

    try {
        body =
            await req.json()
                .catch(
                    () => null
                ) as Body | null;
    } catch {
        body = null;
    }

    if (!body) {
        return json(
            400,
            {
                success: false,
                error: 'BAD_JSON',
            }
        );
    }

    const walletRaw =
        asString(
            body.wallet_address
        );

    const destinationRaw =
        asString(
            body.destination
        );

    const claimAmountRaw =
        asString(
            body.claim_amount
        );

    const phaseId =
        Number(
            body.phase_id ?? 0
        );

    const claimScope:
        ClaimScope =
        body.claim_scope ===
            'identity'
            ? 'identity'
            : 'wallet';

    const isAllPhases =
        claimScope ===
        'identity' &&
        phaseId === 0;

    if (
        !walletRaw ||
        !destinationRaw ||
        !claimAmountRaw
    ) {
        return json(
            400,
            {
                success: false,
                error:
                    'MISSING_FIELDS',
            }
        );
    }

    if (
        !Number.isInteger(
            phaseId
        ) ||
        phaseId < 0
    ) {
        return json(
            400,
            {
                success: false,
                error: 'BAD_PHASE_ID',
            }
        );
    }

    if (
        claimScope ===
        'wallet' &&
        phaseId <= 0
    ) {
        return json(
            400,
            {
                success: false,
                error: 'BAD_PHASE_ID',
            }
        );
    }

    if (
        claimScope ===
        'identity' &&
        phaseId !== 0
    ) {
        return json(
            400,
            {
                success: false,
                error:
                    'IDENTITY_SCOPE_REQUIRES_PHASE_ZERO',
            }
        );
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
        return json(
            400,
            {
                success: false,
                error:
                    'INVALID_PUBKEY',
            }
        );
    }

    const configuration =
        validateConfiguration();

    if (
        !configuration.ok
    ) {
        return json(
            503,
            {
                success: false,
                error:
                    configuration.error,
            }
        );
    }

    let requestedBase:
        bigint;

    try {
        requestedBase =
            toBaseUnits(
                claimAmountRaw,
                configuration.megyDecimals
            );

        if (
            requestedBase <= 0n
        ) {
            throw new Error(
                'BAD_AMOUNT'
            );
        }
    } catch {
        return json(
            400,
            {
                success: false,
                error: 'BAD_AMOUNT',
            }
        );
    }

    /* ------------------------------------------------------------------------ */
    /* Identity authorization                                                   */
    /* ------------------------------------------------------------------------ */

    const identityGuard =
        await requireIdentityWalletAccess(
            wallet
        );

    if (
        !identityGuard.ok
    ) {
        return json(
            identityGuard.status,
            {
                success: false,
                error:
                    identityGuard.error,
            }
        );
    }

    const identityId =
        identityGuard.identityId;

    if (!identityId) {
        return json(
            403,
            {
                success: false,
                error:
                    'IDENTITY_REQUIRED',
            }
        );
    }

    /* ------------------------------------------------------------------------ */
    /* Wallet scope                                                             */
    /* ------------------------------------------------------------------------ */

    let scopedWallets =
        [wallet];

    if (isAllPhases) {
        const linked =
            await sql`
        SELECT wallet_address
        FROM identity_wallets
        WHERE identity_id =
          ${identityId}
          AND chain = 'solana'
          AND verified_at
            IS NOT NULL
        ORDER BY created_at ASC
      `;

        scopedWallets =
            Array.from(
                new Set(
                    (linked ?? [])
                        .map(
                            (
                                row:
                                    unknown
                            ) => {
                                const record =
                                    asDbRow(
                                        row
                                    );

                                return asString(
                                    record.wallet_address
                                );
                            }
                        )
                        .filter(Boolean)
                )
            );

        if (
            !scopedWallets.some(
                (item) =>
                    item.toLowerCase() ===
                    wallet.toLowerCase()
            )
        ) {
            scopedWallets.push(
                wallet
            );
        }
    }

    /* ------------------------------------------------------------------------ */
    /* Claimable buckets                                                        */
    /* ------------------------------------------------------------------------ */

    let buckets:
        ClaimableBucket[] = [];

    if (!isAllPhases) {
        const rows =
            await sql`
        WITH snap AS (
          SELECT
            COALESCE(
              SUM(
                megy_amount_base
              ),
              0
            ) AS snap_base
          FROM claim_snapshots
          WHERE wallet_address =
            ${wallet}
            AND phase_id =
              ${phaseId}
        ),
        cl AS (
          SELECT
            COALESCE(
              SUM(
                claim_amount_base
              ),
              0
            ) AS claimed_base
          FROM claims
          WHERE wallet_address =
            ${wallet}
            AND phase_id =
              ${phaseId}
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
        WHERE p.id =
          ${phaseId}
        LIMIT 1
      `;

        if (
            !rows?.length
        ) {
            return json(
                404,
                {
                    success: false,
                    error:
                        'PHASE_NOT_FOUND',
                }
            );
        }

        const row =
            asDbRow(
                rows[0]
            );

        const snapBase =
            BigInt(
                String(
                    row.snap_base ??
                    '0'
                )
            );

        const claimedBase =
            BigInt(
                String(
                    row.claimed_base ??
                    '0'
                )
            );

        const claimableBase =
            snapBase >
                claimedBase
                ? snapBase -
                claimedBase
                : 0n;

        if (
            requestedBase >
            claimableBase
        ) {
            return json(
                409,
                {
                    success: false,
                    error:
                        'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
                }
            );
        }

        if (
            claimableBase <= 0n
        ) {
            return json(
                409,
                {
                    success: false,
                    error:
                        'NO_CLAIMABLE_BALANCE',
                }
            );
        }

        buckets = [
            {
                walletAddress:
                    wallet,
                phaseId,
                phaseNo:
                    row.phase_no != null
                        ? Number(
                            row.phase_no
                        )
                        : null,
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
        const rows =
            await sql`
        WITH scoped_wallets AS (
          SELECT
            unnest(
              ${scopedWallets}::text[]
            )
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
      `;

        buckets =
            (rows ?? [])
                .map(
                    (
                        row:
                            unknown
                    ) => {
                        const record =
                            asDbRow(
                                row
                            );

                        return {
                            walletAddress:
                                asString(
                                    record.wallet_address
                                ),
                            phaseId:
                                Number(
                                    record.phase_id
                                ),
                            phaseNo:
                                record.phase_no !=
                                    null
                                    ? Number(
                                        record.phase_no
                                    )
                                    : null,
                            phaseName:
                                record.phase_name
                                    ? String(
                                        record.phase_name
                                    )
                                    : null,
                            claimableBase:
                                BigInt(
                                    String(
                                        record.remaining_base ??
                                        '0'
                                    )
                                ),
                        };
                    }
                )
                .filter(
                    (
                        bucket
                    ) =>
                        bucket.walletAddress &&
                        Number.isInteger(
                            bucket.phaseId
                        ) &&
                        bucket.phaseId >
                        0 &&
                        bucket.claimableBase >
                        0n
                );

        if (
            buckets.length === 0
        ) {
            return json(
                409,
                {
                    success: false,
                    error:
                        'NO_CLAIMABLE_BALANCE',
                }
            );
        }
    }

    /* ------------------------------------------------------------------------ */
    /* Deterministic allocation                                                 */
    /* ------------------------------------------------------------------------ */

    let allocationResult;

    try {
        allocationResult =
            allocateClaimAmountOrThrow(
                buckets,
                requestedBase
            );
    } catch (
    error:
        unknown
    ) {
        const message =
            error instanceof Error
                ? error.message
                : '';

        if (
            message ===
            'CLAIM_AMOUNT_EXCEEDS_AVAILABLE'
        ) {
            return json(
                409,
                {
                    success: false,
                    error:
                        isAllPhases
                            ? 'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE'
                            : 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
                }
            );
        }

        console.error(
            '[CLAIM_FEE_QUOTE] allocation failed:',
            error
        );

        return json(
            500,
            {
                success: false,
                error:
                    'CLAIM_ALLOCATION_FAILED',
            }
        );
    }

    const touchedPhaseIds =
        getTouchedPhaseIds(
            allocationResult
                .allocations
        );

    if (
        touchedPhaseIds.length ===
        0
    ) {
        return json(
            409,
            {
                success: false,
                error:
                    'NO_CLAIMABLE_BALANCE',
            }
        );
    }

    /* ------------------------------------------------------------------------ */
    /* Existing protocol fee credits                                            */
    /* ------------------------------------------------------------------------ */

    const existingCredits =
        await sql`
      SELECT phase_id
      FROM claim_fee_credits
      WHERE identity_id =
        ${identityId}
        AND destination =
          ${destination}
        AND phase_id =
          ANY(
            ${touchedPhaseIds}
          )
    `;

    const creditedPhases =
        new Set<number>(
            (existingCredits ??
                [])
                .map(
                    (
                        row:
                            unknown
                    ) => {
                        const record =
                            asDbRow(
                                row
                            );

                        return Number(
                            record.phase_id
                        );
                    }
                )
                .filter(
                    (
                        value
                    ) =>
                        Number.isInteger(
                            value
                        ) &&
                        value > 0
                )
        );

    let ataEntitlement:
        {
            paymentId: number;
            ataCreationLamports: number;
        } | null = null;

    try {
        ataEntitlement =
            await getUnusedAtaEntitlement({
                identityId:
                    String(identityId),
                destination,
            });
    } catch (error) {
        console.error(
            '[CLAIM_FEE_QUOTE] ATA entitlement lookup failed:',
            error
        );

        return json(
            500,
            {
                success: false,
                error:
                    'ATA_ENTITLEMENT_LOOKUP_FAILED',
            }
        );
    }

    /* ------------------------------------------------------------------------ */
    /* Destination MEGY ATA                                                     */
    /* ------------------------------------------------------------------------ */

    const connection =
        getServerSolanaConnection();

    let destinationAta:
        PublicKey;

    try {
        destinationAta =
            await getAssociatedTokenAddress(
                configuration.megyMint,
                new PublicKey(
                    destination
                ),
                false
            );
    } catch (
    error
    ) {
        console.error(
            '[CLAIM_FEE_QUOTE] ATA derivation failed:',
            error
        );

        return json(
            500,
            {
                success: false,
                error:
                    'ATA_DERIVATION_FAILED',
            }
        );
    }

    let ataRequired =
        false;

    /**
     * Solana'nın şu anda ATA oluşturmak için gerçekten
     * gerektirdiği rent-exempt miktar.
     */
    let currentAtaCreationLamports =
        0;

    /**
     * Bu request'te kullanıcıdan ayrıca tahsil edilecek
     * ATA miktarı.
     *
     * Kullanıcının daha önce ödenmiş fakat henüz tüketilmemiş
     * bir ATA entitlement'ı varsa 0 olur.
     */
    let ataChargeLamports =
        0;

    try {
        const ataInfo =
            await connection
                .getAccountInfo(
                    destinationAta,
                    'confirmed'
                );

        ataRequired =
            !ataInfo;

        if (ataRequired) {
            currentAtaCreationLamports =
                await connection
                    .getMinimumBalanceForRentExemption(
                        AccountLayout.span,
                        'confirmed'
                    );

            if (
                !Number.isSafeInteger(
                    currentAtaCreationLamports
                ) ||
                currentAtaCreationLamports <= 0
            ) {
                throw new Error(
                    'BAD_ATA_COST'
                );
            }

            ataChargeLamports =
                ataEntitlement
                    ? 0
                    : currentAtaCreationLamports;
        }
    } catch (
    error
    ) {
        console.error(
            '[CLAIM_FEE_QUOTE] ATA lookup failed:',
            error
        );

        return json(
            503,
            {
                success: false,
                error:
                    'ATA_COST_UNAVAILABLE',
            }
        );
    }

    if (
        !Number.isSafeInteger(
            currentAtaCreationLamports
        ) ||
        currentAtaCreationLamports < 0 ||
        !Number.isSafeInteger(
            ataChargeLamports
        ) ||
        ataChargeLamports < 0
    ) {
        return json(
            503,
            {
                success: false,
                error:
                    'BAD_ATA_COST',
            }
        );
    }

    let feeCalculation;

    try {
        feeCalculation =
            calculateClaimFeeQuote({
                touchedPhaseIds,
                creditedPhaseIds:
                    Array.from(
                        creditedPhases
                    ),
                baseFeeLamports:
                    BASE_CLAIM_FEE_LAMPORTS,
                ataCreationLamports:
                    ataChargeLamports,
            });
    } catch (error) {
        console.error(
            '[CLAIM_FEE_QUOTE] fee calculation failed:',
            error
        );

        return json(
            500,
            {
                success: false,
                error:
                    'CLAIM_FEE_CALCULATION_FAILED',
            }
        );
    }

    /* ------------------------------------------------------------------------ */
    /* Quote                                                                     */
    /* ------------------------------------------------------------------------ */

    const now =
        new Date();

    const expiresAt =
        new Date(
            now.getTime() +
            QUOTE_TTL_SECONDS *
            1000
        );

    return json(
        200,
        {
            success: true,

            claim_scope:
                claimScope,

            phase_id:
                phaseId,

            destination,

            claim_fee_treasury:
                configuration
                    .claimFeeTreasury
                    .toBase58(),

            touched_phase_ids:
                feeCalculation.touchedPhaseIds,

            fee_phase_ids:
                feeCalculation.feePhaseIds,

            credited_phase_ids:
                feeCalculation.creditedPhaseIds,

            protocol_fee_per_phase_lamports:
                BASE_CLAIM_FEE_LAMPORTS,

            protocol_fee_lamports:
                feeCalculation.protocolFeeLamports,

            fee_credit_count:
                feeCalculation.feeCreditCount,

            ata_required:
                ataRequired,

            ata_entitlement_available:
                Boolean(ataEntitlement),

            ata_entitlement_payment_id:
                ataEntitlement?.paymentId ?? null,

            ata_address:
                destinationAta.toBase58(),

            ata_creation_lamports:
                currentAtaCreationLamports,

            ata_charge_lamports:
                feeCalculation.ataCreationLamports,

            required_lamports:
                feeCalculation.requiredLamports,

            network_fee_sponsored:
                true,

            quoted_at:
                now.toISOString(),

            expires_at:
                expiresAt.toISOString(),
        }
    );
}