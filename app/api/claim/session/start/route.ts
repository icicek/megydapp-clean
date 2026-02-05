// app/api/claim/session/start/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

// ✅ Support both server-only and NEXT_PUBLIC env names
const TREASURY = new PublicKey(
  process.env.CLAIM_FEE_TREASURY ??
    process.env.NEXT_PUBLIC_CLAIM_FEE_TREASURY ??
    'D7iqkQmY3ryNFtc9qseUv6kPeVjxsSD98hKN5q3rkYTd'
);

// tolerances
const AMOUNT_TOLERANCE_PCT = Number(process.env.CLAIM_FEE_TOLERANCE_PCT ?? 0.02); // 2%
const MAX_TX_AGE_MINUTES = Number(process.env.CLAIM_FEE_MAX_TX_AGE_MINUTES ?? 30);

type Body = {
  wallet_address: string;
  destination: string;

  // ✅ optional: only required when there is NO open session
  fee_tx_signature?: string;
  fee_amount?: number; // lamports
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
  minLamports: number;
}) {
  const conn = new Connection(RPC_URL, 'confirmed');

  const tx = await conn.getParsedTransaction(opts.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });

  if (!tx) throw new Error('FEE_TX_NOT_FOUND');
  if (tx.meta?.err) throw new Error('FEE_TX_FAILED');

  // age check
  if (typeof tx.blockTime === 'number') {
    const ageMs = Date.now() - tx.blockTime * 1000;
    if (ageMs > MAX_TX_AGE_MINUTES * 60 * 1000) throw new Error('FEE_TX_TOO_OLD');
  }

  const payer = opts.payer;
  const treasury = opts.treasury.toBase58();

  // Look for SYSTEM transfer (parsed)
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

  const minOk = Math.floor(opts.minLamports * (1 - AMOUNT_TOLERANCE_PCT));
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
  const sig = String(body.fee_tx_signature ?? '').trim(); // optional
  const feeLamports = Number(body.fee_amount ?? 0);       // optional

  if (!wallet || !destination) return json(400, { success: false, error: 'MISSING_FIELDS' });

  if (!isBase58Pubkey(wallet) || !isBase58Pubkey(destination) || !isBase58Pubkey(TREASURY.toBase58())) {
    return json(400, { success: false, error: 'INVALID_PUBKEY' });
  }

  // ✅ 1) Reuse open session (wallet-based, destination-independent)
  try {
    const open = await sql`
      SELECT id, destination
      FROM claim_sessions
      WHERE wallet_address = ${wallet}
        AND status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1
    `;

    if (open?.length && open[0]?.id) {
      const currentDest = String(open[0].destination ?? '').trim();
      if (currentDest !== destination) {
        // update destination to latest
        await sql`
          UPDATE claim_sessions
          SET destination = ${destination}
          WHERE id = ${open[0].id}
        `;
      }

      return json(200, { success: true, session_id: open[0].id, reused: true });
    }
  } catch (e) {
    console.error('open session select failed:', e);
    return json(500, { success: false, error: 'DB_ERROR_SELECT_OPEN_SESSION' });
  }

  // ✅ 2) No open session => fee required
  if (!sig) return json(400, { success: false, error: 'MISSING_FEE_SIGNATURE' });

  if (!Number.isFinite(feeLamports) || feeLamports <= 0) {
    return json(400, { success: false, error: 'BAD_FEE_AMOUNT' });
  }

  // ✅ 3) Fee signature must be unique (prevent replay)
  try {
    const used = await sql`
      SELECT id
      FROM claim_sessions
      WHERE fee_tx_signature = ${sig}
      LIMIT 1
    `;
    if (used?.length) {
      return json(409, { success: false, error: 'FEE_SIGNATURE_ALREADY_USED' });
    }
  } catch (e) {
    console.error('fee signature check failed:', e);
    return json(500, { success: false, error: 'DB_ERROR_SIGNATURE_CHECK' });
  }

  // ✅ 4) Verify fee transfer on-chain
  try {
    await verifyFeeTransfer({
      signature: sig,
      payer: wallet,
      treasury: TREASURY,
      minLamports: Math.floor(feeLamports),
    });
  } catch (e: any) {
    const msg = String(e?.message ?? 'FEE_VERIFY_FAILED');
    return json(400, { success: false, error: msg });
  }

  // ✅ 5) Create session (race-safe fallback)
  try {
    const rows = await sql`
      INSERT INTO claim_sessions (
        wallet_address,
        destination,
        status,
        fee_tx_signature,
        fee_amount,
        opened_at,
        total_claimed_in_session
      )
      VALUES (
        ${wallet},
        ${destination},
        'open',
        ${sig},
        ${Math.floor(feeLamports)},
        now(),
        0
      )
      RETURNING id
    `;

    const sessionId = rows?.[0]?.id ?? null;
    if (!sessionId) return json(500, { success: false, error: 'SESSION_CREATE_FAILED' });

    return json(200, { success: true, session_id: sessionId, reused: false });
  } catch (e: any) {
    console.error('claim_sessions insert failed:', e);

    // If a unique constraint exists (recommended), fallback: fetch open session again
    const msg = String(e?.message ?? '').toLowerCase();
    if (msg.includes('unique') || msg.includes('duplicate')) {
      try {
        const open2 = await sql`
          SELECT id
          FROM claim_sessions
          WHERE wallet_address = ${wallet}
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
