// app/api/indexer/covalent/route.ts
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get('chainId');
  const address = searchParams.get('address');
  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId & address required' }, { status: 400 });
  }
  const key = process.env.COVALENT_KEY; // server-only
  const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?no-nft-fetch=true&quote-currency=USD&key=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  return NextResponse.json(json);
}
