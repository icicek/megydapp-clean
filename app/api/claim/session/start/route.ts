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
const AMOUNT_TOLERANCE_PCT = 0.02; // %2 tolerans
const MAX_TX_AGE_MINUTES = 30;

type Body = {
  wallet_address: string;
  destination: string;
  fee_tx_signature: string;
  fee_amount?: number; // lamports (numeric)
};

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

  // başarısız tx
  if (tx.meta?.err) throw new Error('FEE_TX_FAILED');

  // yaş kontrolü (opsiyonel ama faydalı)
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
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ success: false, error: 'BAD_JSON' }, { status: 400 });

    const wallet = String(body.wallet_address ?? '').trim();
    const destination = String(body.destination ?? '').trim();
    const sig = String(body.fee_tx_signature ?? '').trim();

    const feeLamports = Number(body.fee_amount ?? 0);

    if (!wallet || !destination || !sig) {
      return NextResponse.json({ success: false, error: 'MISSING_FIELDS' }, { status: 400 });
    }
    if (!Number.isFinite(feeLamports) || feeLamports <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_FEE_AMOUNT' }, { status: 400 });
    }

    // ✅ RPC doğrulama
    await verifyFeeTransfer({
      signature: sig,
      payer: wallet,
      treasury: TREASURY,
      minLamports: Math.floor(feeLamports), // fee_amount'ı "beklenen" olarak kabul ediyoruz
    });

    // ✅ Session aç (DB kolonları: fee_amount, fee_tx_signature, opened_at...)
    // Eğer “açık session varsa tekrar açma” kuralın varsa burada SELECT ile kontrol ediyorsun varsayıyorum.
    const rows = await sql`
      insert into claim_sessions (wallet_address, destination, status, fee_tx_signature, fee_amount, opened_at, total_claimed_in_session)
      values (${wallet}, ${destination}, 'open', ${sig}, ${feeLamports}, now(), 0)
      returning id
    `;

    const sessionId = rows?.[0]?.id ?? null;

    return NextResponse.json({ success: true, session_id: sessionId });
  } catch (e: any) {
    const msg = String(e?.message || 'UNKNOWN');
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
