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

const TREASURY = new PublicKey(
  process.env.CLAIM_FEE_TREASURY ??
    'D7iqkQmY3ryNFtc9qseUv6kPeVjxsSD98hKN5q3rkYTd'
);

// toleranslar
const AMOUNT_TOLERANCE_PCT = Number(process.env.CLAIM_FEE_TOLERANCE_PCT ?? 0.02); // %2 default
const MAX_TX_AGE_MINUTES = Number(process.env.CLAIM_FEE_MAX_TX_AGE_MINUTES ?? 30);

type Body = {
  wallet_address: string;
  destination: string;
  fee_tx_signature?: string; // ✅ optional (open session varsa gerekmez)
  fee_amount?: number;       // ✅ optional (open session varsa gerekmez)
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

// Tx içindeki "wallet -> treasury" transferini doğrula
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

  // yaş kontrolü
  if (typeof tx.blockTime === 'number') {
    const ageMs = Date.now() - tx.blockTime * 1000;
    if (ageMs > MAX_TX_AGE_MINUTES * 60 * 1000) throw new Error('FEE_TX_TOO_OLD');
  }

  const payer = opts.payer;
  const treasury = opts.treasury.toBase58();

  // parsed instructions içinde SYSTEM transfer ara
  let paidLamports = 0;

  for (const ix of tx.transaction.message.instructions as any[]) {
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

  // toleranslı minimum: minLamports * (1 - tol)
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

  // ✅ artık sig zorunlu değil (open session varsa)
  if (!wallet || !destination) return json(400, { success: false, error: 'MISSING_FIELDS' });

  // basic pubkey sanity
  if (!isBase58Pubkey(wallet) || !isBase58Pubkey(destination) || !isBase58Pubkey(TREASURY.toBase58())) {
    return json(400, { success: false, error: 'INVALID_PUBKEY' });
  }

  // ✅ 1) Open session varsa: wallet bazlı reuse (destination bağımsız)
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
      // (opsiyonel) destination değiştiyse session row'u güncelle
      const currentDest = String(open[0].destination ?? '').trim();
      if (currentDest && currentDest !== destination) {
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

  // ✅ 2) Open session yoksa fee zorunlu
  if (!sig) return json(400, { success: false, error: 'MISSING_FEE_SIGNATURE' });
  if (!Number.isFinite(feeLamports) || feeLamports <= 0) {
    return json(400, { success: false, error: 'BAD_FEE_AMOUNT' });
  }

  // 3) Fee signature reuse koruması (DB)
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

  // 4) RPC doğrulama (wallet -> treasury transfer)
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

  // 5) Session aç
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

    const msg = String(e?.message ?? '');
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return json(409, { success: false, error: 'FEE_SIGNATURE_ALREADY_USED' });
    }

    return json(500, { success: false, error: 'DB_ERROR_INSERT_SESSION' });
  }
}
