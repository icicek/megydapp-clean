import { NextResponse } from 'next/server';
import { getStatus, statusTimestamps } from '../_store';

// (Opsiyonel) Node runtime istiyorsan aç:
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get('mint');

  if (!mint) {
    return NextResponse.json({ error: 'Mint address required' }, { status: 400 });
  }

  const status = getStatus(mint);
  return NextResponse.json({
    status,                               // 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist'
    statusAt: statusTimestamps.get(mint) ?? null, // eklenme/değişim zamanı (varsa)
  });
}
