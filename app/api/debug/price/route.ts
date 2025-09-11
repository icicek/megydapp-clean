import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = (searchParams.get('mint') || '').trim();
  const amount = Number(searchParams.get('amount') || '1');

  if (!mint) {
    return NextResponse.json(
      { ok: false, error: 'mint is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Dinamik import: default ya da named export’u yakala
  const mod: any = await import('@/app/api/utils/getUsdValue');
  const fn: any = mod?.default ?? mod?.getUsdValue;
  if (typeof fn !== 'function') {
    return NextResponse.json(
      { ok: false, error: 'getUsdValue not found (default or named export)' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let result: any;
  try {
    // İmza 1: getUsdValue({ mint, amount })
    result = await fn({ mint, amount });
  } catch {
    // İmza 2: getUsdValue(mint, amount)
    result = await fn(mint, amount);
  }

  return NextResponse.json(
    { ok: true, input: { mint, amount }, ...result },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
