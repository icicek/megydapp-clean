// app/api/claim/session/start/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { neon } from '@neondatabase/serverless';
import { requireIdentityWalletAccess } from '@/app/api/_lib/identity-guard';

const sql = neon(process.env.DATABASE_URL!);

const EXPECTED_FEE_LAMPORTS = Number(process.env.CLAIM_FEE_LAMPORTS ?? 3_000_000);
const CLAIM_DRY_RUN = String(process.env.CLAIM_DRY_RUN ?? '').toLowerCase() === 'true';

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

const TREASURY = new PublicKey(
  process.env.CLAIM_FEE_TREASURY ??
    process.env.NEXT_PUBLIC_CLAIM_FEE_TREASURY ??
    'D7iqkQmY3ryNFtc9qseUv6kPeVjxsSD98hKN5q3rkYTd'
);

const AMOUNT_TOLERANCE_PCT = Number(process.env.CLAIM_FEE_TOLERANCE_PCT ?? 0.02); // 2%
const MAX_TX_AGE_MINUTES = Number(process.env.CLAIM_FEE_MAX_TX_AGE_MINUTES ?? 30);
const SESSION_MAX_AGE_MINUTES = Number(process.env.CLAIM_SESSION_MAX_AGE_MINUTES ?? 30);

type Body = {
  wallet_address: string;
  destination: string;
  phase_id?: number; // 0 => all linked wallet phases
  claim_scope?: 'wallet' | 'identity';
  fee_tx_signature?: string;
  fee_amount?: number;
};

function json(status: number, data: any) {
  return NextResponse.json(data, { status });
}

function isBase58Pubkey(s: string) {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

async function verifyFeeTransfer(opts: {
  signature: string;
  payer: string;
  treasury: PublicKey;
  expectedLamports: number;
}) {
  const conn = new Connection(RPC_URL, 'confirmed');

  const tx = await conn.getParsedTransaction(opts.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });

  if (!tx) throw new Error('FEE_TX_NOT_FOUND');
  if (tx.meta?.err) throw new Error('FEE_TX_FAILED');

  if (typeof tx.blockTime === 'number') {
    const ageMs = Date.now() - tx.blockTime * 1000;
    if (ageMs > MAX_TX_AGE_MINUTES * 60 * 1000) throw new Error('FEE_TX_TOO_OLD');
  }

  const payer = opts.payer;
  const treasury = opts.treasury.toBase58();

  let paidLamports = 0;
  const ixs = tx.transaction.message.instructions as any[];

  for (const ix of ixs) {
    const program = ix?.program;
    const type = ix?.parsed?.type;
    if (program !== 'system' || type !== 'transfer') continue;

    const info = ix.parsed?.info;
    const from = info?.source;
    const to = info?.destination;
    const lamports = Number(info?.lamports ?? 0);

    if (from === payer && to === treasury && Number.isFinite(lamports) && lamports > 0) {
      paidLamports += lamports;
    }
  }

  if (paidLamports <= 0) throw new Error('FEE_TRANSFER_NOT_DETECTED');

  const minOk = Math.floor(opts.expectedLamports * (1 - AMOUNT_TOLERANCE_PCT));
  if (paidLamports < minOk) throw new Error('FEE_AMOUNT_TOO_LOW');

  return { ok: true, paidLamports };
}

export async function POST(req: NextRequest) {
  let body: Body | null = null;
  try {
    body = (await req.json().catch(() => null)) as Body | null;
  } catch {
    body = null;
  }
  if (!body) return json(400, { success: false, error: 'BAD_JSON' });

  const wallet = String(body.wallet_address ?? '').trim();
  const destination = String(body.destination ?? '').trim();
  const sig = String(body.fee_tx_signature ?? '').trim();

  const phaseId = Number(body.phase_id ?? 0);
  const claimScope = body.claim_scope === 'identity' ? 'identity' : 'wallet';
  const isAllPhases = claimScope === 'identity' && phaseId === 0;

  if (!Number.isInteger(phaseId) || phaseId < 0) {
    return json(400, { success: false, error: 'BAD_PHASE_ID' });
  }

  if (claimScope === 'wallet' && phaseId <= 0) {
    return json(400, { success: false, error: 'BAD_PHASE_ID' });
  }

  if (!wallet || !destination) return json(400, { success: false, error: 'MISSING_FIELDS' });

  if (!isBase58Pubkey(wallet) || !isBase58Pubkey(destination) || !isBase58Pubkey(TREASURY.toBase58())) {
    return json(400, { success: false, error: 'INVALID_PUBKEY' });
  }

  const identityGuard = await requireIdentityWalletAccess(wallet);

  if (!identityGuard.ok) {
    return json(identityGuard.status, {
      success: false,
      error: identityGuard.error,
    });
  }

  const identityId = String(
    (identityGuard as any).identityId ||
    (identityGuard as any).identity_id ||
    (identityGuard as any).identity?.id ||
    ''
  ).trim();

  if (!identityId) {
    return json(403, {
      success: false,
      error: 'IDENTITY_REQUIRED',
    });
  }

  const MEGY_MINT = String(process.env.MEGY_MINT || '').trim();

  if (!MEGY_MINT && !CLAIM_DRY_RUN) {
    return json(503, {
      success: false,
      code: 'CLAIM_NOT_LIVE',
      error: 'CLAIM_NOT_LIVE',
    });
  }

  // 0) If this identity already paid the fee for this phase, no new fee is required.
  let hasPhaseFeeCredit = false;

  try {
    const creditRows = await sql`
      SELECT id
      FROM claim_fee_credits
      WHERE identity_id = ${identityId}
        AND phase_id = ${phaseId}
      LIMIT 1
    `;

    hasPhaseFeeCredit = creditRows.length > 0;
  } catch (e) {
    console.error('claim fee credit check failed:', e);
    return json(500, { success: false, error: 'DB_ERROR_FEE_CREDIT_CHECK' });
  }

  // 1) Reuse open session (wallet-based)
  try {
    const open = await sql`
      SELECT id, destination, opened_at
      FROM claim_sessions
      WHERE wallet_address = ${wallet}
        AND phase_id = ${phaseId}
        AND status = 'open'
        AND opened_at > now() - (${SESSION_MAX_AGE_MINUTES} || ' minutes')::interval
      ORDER BY opened_at DESC
      LIMIT 1
    `;

    if (open?.length && open[0]?.id) {
      const currentDest = String(open[0].destination ?? '').trim();
    
      if (currentDest !== destination) {
        return json(409, {
          success: false,
          error: 'SESSION_DESTINATION_MISMATCH',
        });
      }
    
      return json(200, {
        success: true,
        session_id: open[0].id,
        reused: true,
        claim_scope: claimScope,
        phase_id: phaseId,
        is_all_phases: isAllPhases,
      });
    }
  } catch (e) {
    console.error('open session select failed:', e);
    return json(500, { success: false, error: 'DB_ERROR_SELECT_OPEN_SESSION' });
  }

  // 2) No open session => fee required only if identity has no phase fee credit
  if (CLAIM_DRY_RUN) {
    hasPhaseFeeCredit = true;
  }
  
  if (!hasPhaseFeeCredit && !sig) {
    return json(400, { success: false, error: 'MISSING_FEE_SIGNATURE' });
  }

  // 3) Fee signature must be unique only when a new fee is required
  if (!hasPhaseFeeCredit) {
    try {
      const used = await sql`
        SELECT id
        FROM claim_sessions
        WHERE fee_tx_signature = ${sig}
        LIMIT 1
      `;
      if (used?.length) return json(409, { success: false, error: 'FEE_SIGNATURE_ALREADY_USED' });
    } catch (e) {
      console.error('fee signature check failed:', e);
      return json(500, { success: false, error: 'DB_ERROR_SIGNATURE_CHECK' });
    }
  }

  // 4) Verify fee transfer on-chain and create identity-phase fee credit if needed
  if (!hasPhaseFeeCredit) {
    try {
      await verifyFeeTransfer({
        signature: sig,
        payer: wallet,
        treasury: TREASURY,
        expectedLamports: EXPECTED_FEE_LAMPORTS,
      });

      await sql`
        INSERT INTO claim_fee_credits (
          identity_id,
          phase_id,
          payer_wallet,
          destination,
          fee_tx_signature,
          fee_amount
        )
        VALUES (
          ${identityId},
          ${phaseId},
          ${wallet},
          ${destination},
          ${sig},
          ${EXPECTED_FEE_LAMPORTS}
        )
        ON CONFLICT (identity_id, phase_id) DO NOTHING
      `;

      hasPhaseFeeCredit = true;
    } catch (e: any) {
      const msg = String(e?.message ?? 'FEE_VERIFY_FAILED');
      return json(400, { success: false, error: msg });
    }
  }

  const sessionFeeSignature = hasPhaseFeeCredit && !sig ? null : sig;
  const sessionFeeAmount = hasPhaseFeeCredit && !sig ? 0 : EXPECTED_FEE_LAMPORTS;

  // 5) Create session
  try {
    const rows = await sql`
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
        ${wallet},
        ${destination},
        ${phaseId},
        'open',
        ${sessionFeeSignature},
        ${sessionFeeAmount},
        now(),
        0
      )
      RETURNING id
    `;

    const sessionId = rows?.[0]?.id ?? null;
    if (!sessionId) return json(500, { success: false, error: 'SESSION_CREATE_FAILED' });

    return json(200, {
      success: true,
      session_id: sessionId,
      reused: false,
      claim_scope: claimScope,
      phase_id: phaseId,
      is_all_phases: isAllPhases,
    });
  } catch (e: any) {
    console.error('claim_sessions insert failed:', e);

    const msg = String(e?.message ?? '').toLowerCase();
    if (msg.includes('unique') || msg.includes('duplicate')) {
      try {
        const open2 = await sql`
          SELECT id
          FROM claim_sessions
          WHERE wallet_address = ${wallet}
            AND phase_id = ${phaseId}
            AND status = 'open'
          ORDER BY opened_at DESC
          LIMIT 1
        `;
        if (open2?.length && open2[0]?.id) {
          return json(200, { success: true, session_id: open2[0].id, reused: true });
        }
      } catch {}
      return json(409, { success: false, error: 'SESSION_ALREADY_OPEN' });
    }

    return json(500, { success: false, error: 'DB_ERROR_INSERT_SESSION' });
  }
}
