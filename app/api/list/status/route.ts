import { NextResponse } from 'next/server';

// Şimdilik sabit listeler (ileride DB'den çekilecek)
const DeadcoinList = new Set<string>([
  'DEADCOIN_MINT_ADDRESS_1',
  'DEADCOIN_MINT_ADDRESS_2',
]);

const Redlist = new Set<string>([
  'REDLIST_MINT_ADDRESS_1',
]);

const Blacklist = new Set<string>([
  'BLACKLIST_MINT_ADDRESS_1',
]);

const WalkingDeadcoinList = new Set<string>([
  'WALKING_DEAD_MINT_ADDRESS_1',
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get('mint');

  if (!mint) {
    return NextResponse.json({ error: 'Mint address required' }, { status: 400 });
  }

  let status: string = 'healthy';

  if (Blacklist.has(mint)) {
    status = 'blacklist';
  } else if (Redlist.has(mint)) {
    status = 'redlist';
  } else if (DeadcoinList.has(mint)) {
    status = 'deadcoin';
  } else if (WalkingDeadcoinList.has(mint)) {
    status = 'walking_dead';
  }

  return NextResponse.json({
    status,
    statusAt: new Date().toISOString(), // Gerçekte DB'den eklenme tarihi çekilebilir
  });
}
