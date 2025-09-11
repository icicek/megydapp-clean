// app/api/proxy/price/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getUsdValue from '@/app/api/utils/getUsdValue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NATIVE_MINT = 'So11111111111111111111111111111111111111112';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = (v ?? '').toString().trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function pickQuery(req: NextRequest) {
  const u = new URL(req.url);
  return {
    source: u.searchParams.get('source'), // legacy
    mint: u.searchParams.get('mint'),
    symbol: u.searchParams.get('symbol'),
    isSol: u.searchParams.get('isSol'),
    amount: u.searchParams.get('amount'),
  };
}

async function pickBody(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await req.json(); } catch { /* ignore */ }
  }
  return {};
}

function normalizeMint(mintRaw: string | null, symbolRaw: string | null, isSolRaw: any): string {
  const symU = (symbolRaw || '').trim().toUpperCase();
  const isSol = toBool(isSolRaw);
  let mint = (mintRaw || '').trim();

  if (
    !mint ||
    mint === SYSTEM_PROGRAM ||
    mint.toUpperCase() === 'SOL' ||
    mint.toUpperCase() === 'WSOL' ||
    symU === 'SOL' || symU === 'WSOL' ||
    isSol
  ) {
    mint = NATIVE_MINT;
  }
  return mint;
}

async function handle(req: NextRequest) {
  try {
    const q = pickQuery(req);
    const b: any = await pickBody(req);

    const sourceLegacy = (b.source ?? q.source ?? '').toString().toLowerCase();
    const symbol = (b.symbol ?? b?.params?.symbol ?? q.symbol ?? '').toString().trim() || undefined;

    const mint = normalizeMint(
      (b.mint ?? b?.params?.mint ?? q.mint) as string | null,
      symbol || null,
      (b.isSol ?? b?.params?.isSol ?? q.isSol)
    );

    const amountNum = Number(b.amount ?? b?.params?.amount ?? q.amount ?? '1');
    const amount = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 1;

    const res = await getUsdValue({ mint, amount, symbol });

    const unitPrice = res.status === 'found' ? (res.usdValue / amount) : 0;
    const actualSource = (res.sources?.[0]?.source) || sourceLegacy || 'auto';

    const ok = res.status === 'found';
    const success = ok; // legacy alan

    return NextResponse.json(
      {
        // 🔙 Geri uyumlu alanlar
        ok,
        success,
        source: actualSource,
        mint,
        isSol: mint === NATIVE_MINT,
        priceUsd: unitPrice,

        // 🔎 Yeni / tanı alanları
        status: res.status,
        usdValue: res.usdValue,
        sources: res.sources,
        input: { symbol, amount },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('🔥 [/api/proxy/price] Error:', err?.message || err);
    return NextResponse.json(
      { ok: false, success: false, status: 'error', error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
